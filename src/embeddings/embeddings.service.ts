import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { CircuitBreaker } from '../utils/circuit-breaker';

@Injectable()
export class EmbeddingsService implements IEmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly ai: GoogleGenAI;
  private readonly modelName = 'gemini-embedding-2';
  private readonly circuitBreaker = new CircuitBreaker('EmbeddingsService', {
    failureThreshold: 3,
    cooldownPeriod: 15000, // 15 seconds cooldown for demo testing
  });

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('app.googleApiKey') ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY is not defined in environment configurations',
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      this.logger.warn(
        `Gemini API call failed: ${error instanceof Error ? error.message : String(error)
        }. Retrying in ${delay}ms... (Retries left: ${retries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    this.logger.log(
      `Generating embedding for text: "${text.substring(0, 30)}..."`,
    );

    const result = await this.circuitBreaker.execute(() =>
      this.retryWithBackoff(() =>
        this.ai.models.embedContent({
          model: this.modelName,
          contents: text,
        }),
      ),
    );

    if (
      result.embeddings &&
      result.embeddings[0] &&
      result.embeddings[0].values
    ) {
      return result.embeddings[0].values;
    }

    throw new Error('No embedding vector returned in Gemini response');
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    this.logger.log(
      `Generating embeddings for ${texts.length} items in parallel`,
    );
    return Promise.all(texts.map((text) => this.generateEmbedding(text)));
  }
}
