import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

export interface RetrievedChunk {
  chunk: string;
  score: number;
  metadata: {
    documentId: string;
    filename: string;
    chunkIndex: number;
  };
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly similarityThreshold: number;

  constructor(
    @Inject(IEmbeddingsService)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(IVectorStoreService)
    private readonly vectorStoreService: IVectorStoreService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.similarityThreshold =
      this.configService?.get<number>('app.similarityThreshold') ??
      parseFloat(process.env.SIMILARITY_THRESHOLD || '0.35');
  }

  async retrieve(question: string): Promise<RetrievedChunk[]> {
    this.logger.log(
      `Retrieving context for question: "${question.substring(0, 50)}..."`,
    );

    // 1. Generate embedding for user question
    const queryEmbedding =
      await this.embeddingsService.generateEmbedding(question);

    // 2. Perform similarity search in ChromaDB (limit 5 chunks)
    const searchResults = await this.vectorStoreService.similaritySearch(
      queryEmbedding,
      5,
    );

    // 3. Filter by similarity threshold
    // For normalized vectors, similarity is accurately given by: 1 - (rawDistance / 2)
    const filteredResults = searchResults
      .map((res, idx) => {
        const rawDistance = res.score;
        const similarity = Math.max(0, 1 - rawDistance / 2);

        this.logger.log(
          `Chunk #${idx + 1} (doc: ${res.metadata.documentId}, chunkIdx: ${res.metadata.chunkIndex}): raw distance = ${rawDistance.toFixed(4)}, similarity = ${similarity.toFixed(4)}`,
        );

        return {
          chunk: res.metadata.text,
          score: similarity,
          metadata: {
            documentId: res.metadata.documentId,
            filename: res.metadata.filename,
            chunkIndex: res.metadata.chunkIndex,
          },
        };
      })
      .filter((item) => item.score >= this.similarityThreshold);

    this.logger.log(
      `Retrieved ${filteredResults.length} chunks matching similarity threshold >= ${this.similarityThreshold}`,
    );

    return filteredResults;
  }
}
