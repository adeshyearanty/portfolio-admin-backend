import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { CircuitBreaker } from '../utils/circuit-breaker';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly ai: GoogleGenAI;
  private readonly modelName = 'gemini-2.5-flash';

  private readonly circuitBreaker = new CircuitBreaker('GeminiService', {
    failureThreshold: 3,
    cooldownPeriod: 15000, // 15 seconds cooldown for faster demo testing
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
        `Gemini call failed: ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${delay}ms... (Retries left: ${retries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, retries - 1, delay * 2);
    }
  }

  async generateAnswer(
    question: string,
    context: string,
    systemInstruction?: string,
  ): Promise<string> {
    this.logger.log(
      `Generating answer for question: "${question.substring(0, 30)}..."`,
    );

    const prompt = this.buildPrompt(question, context);

    const response = await this.circuitBreaker.execute(() =>
      this.retryWithBackoff(() =>
        this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        }),
      ),
    );

    if (!response.text) {
      throw new Error('Gemini API returned empty response text');
    }

    return response.text;
  }

  async *generateAnswerStream(
    question: string,
    context: string,
    systemInstruction?: string,
  ): AsyncGenerator<string> {
    this.logger.log(
      `Generating streaming answer for question: "${question.substring(
        0,
        30,
      )}..."`,
    );

    const prompt = this.buildPrompt(question, context);

    const responseStream = await this.circuitBreaker.execute(() =>
      this.retryWithBackoff(() =>
        this.ai.models.generateContentStream({
          model: this.modelName,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        }),
      ),
    );

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }

  private buildPrompt(question: string, context: string): string {
    return `Context:
${context || 'No background context available.'}

Question:
${question}

Answer the question accurately based on the context. If the context does not contain enough information to answer, state that clearly.`;
  }
}
