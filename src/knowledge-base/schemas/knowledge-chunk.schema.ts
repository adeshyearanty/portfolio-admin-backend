import { Document } from 'mongodb';

export interface KnowledgeChunkMetadata {
  title?: string;
  filename: string;
  section?: string;
  chunkIndex: number;
  [key: string]: unknown;
}

export interface KnowledgeChunkDocument extends Document {
  _id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: KnowledgeChunkMetadata;
  createdAt: Date;
  updatedAt: Date;
}
