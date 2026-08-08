import { Injectable } from '@nestjs/common';
import { Prisma, KnowledgeDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IDocumentRepository } from './document.repository.interface';

@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.KnowledgeDocumentCreateInput,
  ): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.create({ data });
  }

  async update(
    id: string,
    data: Prisma.KnowledgeDocumentUpdateInput,
  ): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<KnowledgeDocument> {
    return this.prisma.knowledgeDocument.delete({
      where: { id },
    });
  }

  async findUnique(id: string): Promise<KnowledgeDocument | null> {
    return this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
  }

  async findManyAndCount(params: {
    where?: Prisma.KnowledgeDocumentWhereInput;
    orderBy?: Prisma.KnowledgeDocumentOrderByWithRelationInput;
    skip?: number;
    take?: number;
  }): Promise<[KnowledgeDocument[], number]> {
    const { where, orderBy, skip, take } = params;
    return this.prisma.$transaction([
      this.prisma.knowledgeDocument.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      this.prisma.knowledgeDocument.count({ where }),
    ]);
  }
}
