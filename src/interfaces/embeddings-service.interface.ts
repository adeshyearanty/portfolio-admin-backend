export interface IEmbeddingsService {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export const IEmbeddingsService = Symbol('IEmbeddingsService');
