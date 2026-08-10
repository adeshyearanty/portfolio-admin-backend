import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';

@Injectable()
export class EmbeddingsService implements IEmbeddingsService, OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);
  private extractor: any = null;
  private readonly modelName: string;
  private readonly expectedDimension: number;

  private readonly circuitBreaker = new CircuitBreaker('EmbeddingsService', {
    failureThreshold: 3,
    cooldownPeriod: 15000,
  });

  constructor(private readonly configService: ConfigService) {
    const rawModel =
      this.configService.get<string>('app.embeddingModel') ||
      process.env.EMBEDDING_MODEL ||
      'sentence-transformers/all-MiniLM-L6-v2';

    // Map Hugging Face Hub model name to Xenova ONNX model name
    if (rawModel === 'sentence-transformers/all-MiniLM-L6-v2') {
      this.modelName = 'Xenova/all-MiniLM-L6-v2';
    } else {
      this.modelName = rawModel;
    }

    this.expectedDimension = parseInt(
      this.configService.get<string>('app.embeddingDimensions') ||
        process.env.EMBEDDING_DIMENSIONS ||
        '384',
      10,
    );
  }

  async onModuleInit() {
    await this.initModel();
  }

  private async initModel() {
    try {
      this.logger.log(
        `Embedding model initialization started: ${this.modelName}`,
      );
      const { pipeline } = await import('@huggingface/transformers');
      this.logger.log('Loading local embedding model...');
      this.extractor = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Embedding model ready');
    } catch (err) {
      this.logger.error(
        `Embedding model download/loading failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  private async ensureModelReady() {
    if (!this.extractor) {
      this.logger.warn(
        'Embedding model was not ready, attempting initialization',
      );
      await this.initModel();
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isNonRetryable =
        error?.message?.includes('Dimension mismatch') ||
        error?.message?.includes('cannot be empty');

      if (retries <= 0 || isNonRetryable) {
        throw error;
      }
      this.logger.warn(
        `Local Embedding call failed: ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${delay}ms... (Retries left: ${retries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new Error('Input text for embedding cannot be empty');
    }

    await this.ensureModelReady();

    const result = await this.circuitBreaker.execute(() =>
      this.retryWithBackoff(async () => {
        const output = await this.extractor(text, {
          pooling: 'mean',
          normalize: true,
        });
        const vector = Array.from(output.data) as number[];
        if (vector.length !== this.expectedDimension) {
          throw new Error(
            `Dimension mismatch: expected ${this.expectedDimension}, got ${vector.length}`,
          );
        }
        return vector;
      }),
    );

    return result;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const nonEmptyTexts = texts.filter((t) => t && t.trim() !== '');
    if (nonEmptyTexts.length === 0) {
      return texts.map(() => new Array(this.expectedDimension).fill(0));
    }

    await this.ensureModelReady();

    this.logger.log(`Embedding batch started for ${texts.length} texts`);

    const result = await this.circuitBreaker.execute(() =>
      this.retryWithBackoff(async () => {
        const output = await this.extractor(texts, {
          pooling: 'mean',
          normalize: true,
        });
        const numTexts = output.dims[0];
        const dim = output.dims[1];
        if (dim !== this.expectedDimension) {
          throw new Error(
            `Dimension mismatch: expected ${this.expectedDimension}, got ${dim}`,
          );
        }

        const embeddings: number[][] = [];
        for (let i = 0; i < numTexts; i++) {
          const start = i * dim;
          const end = start + dim;
          embeddings.push(
            Array.from(output.data.slice(start, end)) as number[],
          );
        }
        return embeddings;
      }),
    );

    this.logger.log(`Embedding batch completed`);
    return result;
  }
}
