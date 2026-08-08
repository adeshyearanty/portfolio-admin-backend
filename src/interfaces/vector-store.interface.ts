export interface IVectorStoreService {
  createCollection(): Promise<void>;

  insertVectors(
    ids: string[],
    embeddings: number[][],
    metadatas: Array<{
      documentId: string;
      filename: string;
      chunkIndex: number;
      text: string;
    }>,
    documents: string[],
  ): Promise<void>;

  deleteDocument(documentId: string): Promise<void>;

  deleteCollection(): Promise<void>;

  similaritySearch(
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
  >;
}

export const IVectorStoreService = Symbol('IVectorStoreService');
