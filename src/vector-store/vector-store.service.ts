import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, Collection } from 'chromadb';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

@Injectable()
export class VectorStoreService implements IVectorStoreService, OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly client: ChromaClient;
  private collection: Collection | null = null;
  private readonly collectionName = 'portfolio-kb';

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.chromaHost', 'localhost');
    const port = this.configService.get<string>('app.chromaPort', '8000');
    const path = `http://${host}:${port}`;

    this.logger.log(`Connecting to ChromaDB at: ${path}`);
    this.client = new ChromaClient({ path });
  }

  async onModuleInit() {
    try {
      await this.createCollection();
    } catch (err) {
      this.logger.warn(
        `Failed to initialize ChromaDB collection on module startup (this is expected if Chroma is not running): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async createCollection(): Promise<void> {
    this.logger.log(
      `Ensuring ChromaDB collection "${this.collectionName}" exists (metric: cosine)`,
    );
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' },
    });
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
    if (!this.collection) {
      await this.createCollection();
    }

    if (!this.collection) {
      throw new Error('ChromaDB collection is not initialized');
    }

    this.logger.log(
      `Inserting ${ids.length} vectors into "${this.collectionName}"`,
    );
    await this.collection.add({
      ids,
      embeddings,
      metadatas,
      documents,
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!this.collection) {
      await this.createCollection();
    }

    if (!this.collection) {
      throw new Error('ChromaDB collection is not initialized');
    }

    this.logger.log(`Deleting all vectors for documentId: "${documentId}"`);
    await this.collection.delete({
      where: { documentId },
    });
  }

  async deleteCollection(): Promise<void> {
    this.logger.log(`Deleting ChromaDB collection "${this.collectionName}"`);
    await this.client.deleteCollection({
      name: this.collectionName,
    });
    this.collection = null;
  }

  async similaritySearch(
    queryEmbedding: number[],
    limit?: number,
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
    if (!this.collection) {
      await this.createCollection();
    }

    if (!this.collection) {
      throw new Error('ChromaDB collection is not initialized');
    }

    const nResults = limit ?? 5;
    this.logger.log(
      `Performing similarity search in "${this.collectionName}" (limit: ${nResults})`,
    );

    const result = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
    });

    if (!result || !result.ids || result.ids.length === 0) {
      return [];
    }

    const ids = result.ids[0] || [];
    const distances = result.distances ? result.distances[0] : null;
    const metadatas = result.metadatas ? result.metadatas[0] : null;

    return ids.map((id, index) => {
      const score =
        distances && typeof distances[index] === 'number'
          ? distances[index]
          : 0;
      const metadata = metadatas
        ? (metadatas[index] as Record<string, unknown>)
        : {};

      const documentId =
        typeof metadata.documentId === 'string' ? metadata.documentId : '';
      const filename =
        typeof metadata.filename === 'string' ? metadata.filename : '';
      const chunkIndex =
        typeof metadata.chunkIndex === 'number'
          ? metadata.chunkIndex
          : typeof metadata.chunkIndex === 'string'
            ? parseInt(metadata.chunkIndex, 10) || 0
            : 0;
      const text = typeof metadata.text === 'string' ? metadata.text : '';

      return {
        id,
        score,
        metadata: {
          documentId,
          filename,
          chunkIndex,
          text,
        },
      };
    });
  }
}
