export const IDocumentRepository = Symbol('IDocumentRepository');

export interface KnowledgeDocument {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  status: string;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeDocumentCreateInput {
  id?: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  status?: string;
  chunkCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KnowledgeDocumentUpdateInput {
  title?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  status?: string;
  chunkCount?: number;
  updatedAt?: Date;
}

export interface KnowledgeDocumentWhereInput {
  id?: string;
  title?: { contains?: string };
  filename?: { contains?: string };
  status?: string;
  OR?: Array<{
    title?: { contains?: string };
    filename?: { contains?: string };
  }>;
}

export interface KnowledgeDocumentOrderByInput {
  [key: string]: 'asc' | 'desc';
}

export interface IDocumentRepository {
  create(data: KnowledgeDocumentCreateInput): Promise<KnowledgeDocument>;

  update(
    id: string,
    data: KnowledgeDocumentUpdateInput,
  ): Promise<KnowledgeDocument>;

  delete(id: string): Promise<KnowledgeDocument>;

  findUnique(id: string): Promise<KnowledgeDocument | null>;

  findManyAndCount(params: {
    where?: KnowledgeDocumentWhereInput;
    orderBy?: KnowledgeDocumentOrderByInput;
    skip?: number;
    take?: number;
  }): Promise<[KnowledgeDocument[], number]>;
}
