import { Prisma, KnowledgeDocument } from '@prisma/client';

export const IDocumentRepository = Symbol('IDocumentRepository');

export interface IDocumentRepository {
  create(data: Prisma.KnowledgeDocumentCreateInput): Promise<KnowledgeDocument>;

  update(
    id: string,
    data: Prisma.KnowledgeDocumentUpdateInput,
  ): Promise<KnowledgeDocument>;

  delete(id: string): Promise<KnowledgeDocument>;

  findUnique(id: string): Promise<KnowledgeDocument | null>;

  findManyAndCount(params: {
    where?: Prisma.KnowledgeDocumentWhereInput;
    orderBy?: Prisma.KnowledgeDocumentOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<[KnowledgeDocument[], number]>;
}
