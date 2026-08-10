import {
  Injectable,
  Logger,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';
import { KnowledgeChunkDocument } from '../knowledge-base/schemas/knowledge-chunk.schema';
import { Document } from 'mongodb';

@Injectable()
export class MongoVectorStoreService implements IVectorStoreService {
  private readonly logger = new Logger(MongoVectorStoreService.name);
  private readonly collectionName = 'knowledge_chunks';
  private readonly vectorIndexName: string;

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.vectorIndexName =
      this.configService?.get<string>('app.mongodbVectorIndex') ||
      process.env.MONGODB_VECTOR_INDEX ||
      'vector_index';
  }

  private get collection() {
    return this.databaseService.collection<KnowledgeChunkDocument>(
      this.collectionName,
    );
  }

  async createCollection(): Promise<void> {
    try {
      this.logger.log(
        `Ensuring MongoDB vector chunks collection "${this.collectionName}" exists`,
      );
      await this.collection.createIndex({ documentId: 1, chunkIndex: 1 });
    } catch (err: unknown) {
      this.logger.warn(
        `Index creation on "${this.collectionName}" skipped or failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async insertVectors(
    ids: string[],
    embeddings: number[][],
    metadatas: Array<{
      documentId: string;
      filename: string;
      chunkIndex: number;
      text: string;
    }>,
    documents: string[],
  ): Promise<void> {
    if (
      ids.length !== embeddings.length ||
      ids.length !== metadatas.length ||
      ids.length !== documents.length
    ) {
      throw new BadRequestException(
        `Mismatched input lengths for vector insertion: ids=${ids.length}, embeddings=${embeddings.length}, metadatas=${metadatas.length}, documents=${documents.length}`,
      );
    }

    if (ids.length === 0) {
      return;
    }

    const now = new Date();
    const chunkDocs: KnowledgeChunkDocument[] = ids.map((id, index) => {
      const embedding = embeddings[index];
      if (
        !Array.isArray(embedding) ||
        embedding.length === 0 ||
        embedding.some((val) => typeof val !== 'number' || isNaN(val))
      ) {
        throw new BadRequestException(
          `Invalid or missing embedding for chunk at index ${index}`,
        );
      }

      const meta = metadatas[index];
      return {
        _id: id,
        documentId: meta.documentId,
        chunkIndex: meta.chunkIndex ?? index,
        content: documents[index],
        embedding: embedding,
        metadata: {
          ...meta,
          chunkIndex: meta.chunkIndex ?? index,
          text: documents[index],
        },
        createdAt: now,
        updatedAt: now,
      };
    });

    // Delete any existing chunks with these IDs first to ensure idempotency
    await this.collection.deleteMany({
      _id: { $in: chunkDocs.map((c) => c._id) },
    });

    await this.collection.insertMany(chunkDocs, { ordered: true });
    this.logger.log(
      `Inserted ${chunkDocs.length} self-contained vector chunk documents into "${this.collectionName}"`,
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.logger.log(
      `Deleting chunk vectors for documentId: "${documentId}" from "${this.collectionName}"`,
    );
    const result = await this.collection.deleteMany({ documentId });
    this.logger.log(
      `Deleted ${result.deletedCount} chunks for documentId "${documentId}"`,
    );
  }

  async deleteCollection(): Promise<void> {
    this.logger.log(`Clearing all vectors from "${this.collectionName}"`);
    await this.collection.deleteMany({});
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit = 5,
  ): Promise<
    Array<{
      id: string;
      score: number;
      metadata: {
        documentId: string;
        filename: string;
        chunkIndex: number;
        text: string;
      };
    }>
  > {
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new BadRequestException('Invalid query embedding vector');
    }

    try {
      // 1. Attempt Atlas $vectorSearch aggregation pipeline
      const pipeline: Document[] = [
        {
          $vectorSearch: {
            index: this.vectorIndexName,
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: Math.max(limit * 10, 50),
            limit: limit,
          },
        },
        {
          $project: {
            _id: 1,
            documentId: 1,
            chunkIndex: 1,
            content: 1,
            metadata: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];

      const searchResults = await this.collection
        .aggregate<KnowledgeChunkDocument & { score?: number }>(pipeline)
        .toArray();

      if (searchResults.length > 0) {
        return searchResults.map((doc) => {
          const sim = typeof doc.score === 'number' ? doc.score : 1.0;
          // Convert cosine similarity s in [0, 1] to distance d = (1 - s) * 2 for consumer conversion: similarity = 1 - d/2
          const rawDistance = Math.max(0, (1 - sim) * 2);
          return {
            id: String(doc._id),
            score: rawDistance,
            metadata: {
              documentId: String(doc.documentId || doc.metadata?.documentId || ''),
              filename: String(doc.metadata?.filename || ''),
              chunkIndex: Number(doc.chunkIndex ?? doc.metadata?.chunkIndex ?? 0),
              text: String(doc.content || doc.metadata?.text || ''),
            },
          };
        });
      }
    } catch (atlasError: unknown) {
      this.logger.warn(
        `Atlas $vectorSearch was not available or index "${this.vectorIndexName}" not found. Using exact in-memory similarity fallback: ${
          atlasError instanceof Error ? atlasError.message : String(atlasError)
        }`,
      );
    }

    // 2. In-memory exact Cosine Similarity fallback
    const allChunks = await this.collection.find({}).toArray();
    const scoredChunks = allChunks.map((chunk) => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      const rawDistance = Math.max(0, (1 - similarity) * 2);
      return {
        id: String(chunk._id),
        score: rawDistance,
        metadata: {
          documentId: String(chunk.documentId || chunk.metadata?.documentId || ''),
          filename: String(chunk.metadata?.filename || ''),
          chunkIndex: Number(chunk.chunkIndex ?? chunk.metadata?.chunkIndex ?? 0),
          text: String(chunk.content || chunk.metadata?.text || ''),
        },
      };
    });

    scoredChunks.sort((a, b) => a.score - b.score);
    return scoredChunks.slice(0, limit);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
      return 0;
    }
    const len = Math.min(vecA.length, vecB.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
