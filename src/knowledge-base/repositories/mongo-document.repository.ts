import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  IDocumentRepository,
  KnowledgeDocument,
  KnowledgeDocumentCreateInput,
  KnowledgeDocumentUpdateInput,
  KnowledgeDocumentWhereInput,
  KnowledgeDocumentOrderByInput,
} from './document.repository.interface';
import { randomUUID } from 'crypto';
import { Filter, Document } from 'mongodb';

export interface MongoKnowledgeDocumentDoc extends Document {
  _id: string;
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

@Injectable()
export class MongoDocumentRepository implements IDocumentRepository {
  private readonly collectionName = 'knowledge_documents';

  constructor(private readonly databaseService: DatabaseService) {}

  private get collection() {
    return this.databaseService.collection<MongoKnowledgeDocumentDoc>(
      this.collectionName,
    );
  }

  private mapToEntity(doc: MongoKnowledgeDocumentDoc): KnowledgeDocument {
    return {
      id: doc.id || doc._id,
      title: doc.title,
      filename: doc.filename,
      mimeType: doc.mimeType,
      size: doc.size,
      status: doc.status,
      chunkCount: doc.chunkCount,
      createdAt:
        doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      updatedAt:
        doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
    };
  }

  async create(data: KnowledgeDocumentCreateInput): Promise<KnowledgeDocument> {
    const now = new Date();
    const id = data.id || randomUUID();
    const doc: MongoKnowledgeDocumentDoc = {
      _id: id,
      id: id,
      title: data.title,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      status: data.status || 'PROCESSING',
      chunkCount: data.chunkCount || 0,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    await this.collection.insertOne(doc);
    return this.mapToEntity(doc);
  }

  async update(
    id: string,
    data: KnowledgeDocumentUpdateInput,
  ): Promise<KnowledgeDocument> {
    const now = new Date();
    const updateData: Partial<MongoKnowledgeDocumentDoc> = {
      ...data,
      updatedAt: data.updatedAt || now,
    };

    const result = await this.collection.findOneAndUpdate(
      { $or: [{ _id: id }, { id }] },
      { $set: updateData },
      { returnDocument: 'after' },
    );

    if (!result) {
      throw new Error(`Knowledge document with ID ${id} not found`);
    }

    return this.mapToEntity(result);
  }

  async delete(id: string): Promise<KnowledgeDocument> {
    const doc = await this.findUnique(id);
    if (!doc) {
      throw new Error(`Knowledge document with ID ${id} not found`);
    }

    await this.collection.deleteOne({ $or: [{ _id: id }, { id }] });
    return doc;
  }

  async findUnique(id: string): Promise<KnowledgeDocument | null> {
    const doc = await this.collection.findOne({ $or: [{ _id: id }, { id }] });
    return doc ? this.mapToEntity(doc) : null;
  }

  async findManyAndCount(params: {
    where?: KnowledgeDocumentWhereInput;
    orderBy?: KnowledgeDocumentOrderByInput;
    skip?: number;
    take?: number;
  }): Promise<[KnowledgeDocument[], number]> {
    const { where, orderBy, skip = 0, take = 10 } = params;

    const filter: Filter<MongoKnowledgeDocumentDoc> = {};

    if (where?.OR && Array.isArray(where.OR) && where.OR.length > 0) {
      const orConditions: Filter<MongoKnowledgeDocumentDoc>[] = [];
      for (const cond of where.OR) {
        if (cond.title?.contains) {
          orConditions.push({
            title: { $regex: cond.title.contains, $options: 'i' },
          });
        }
        if (cond.filename?.contains) {
          orConditions.push({
            filename: { $regex: cond.filename.contains, $options: 'i' },
          });
        }
      }

      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }
    } else {
      if (where?.title?.contains) {
        filter.title = { $regex: where.title.contains, $options: 'i' };
      }
      if (where?.filename?.contains) {
        filter.filename = { $regex: where.filename.contains, $options: 'i' };
      }
      if (where?.status) {
        filter.status = where.status;
      }
    }

    const sort: Record<string, 1 | -1> = {};
    if (orderBy && Object.keys(orderBy).length > 0) {
      for (const [key, value] of Object.entries(orderBy)) {
        sort[key] = value === 'asc' ? 1 : -1;
      }
    } else {
      sort.createdAt = -1;
    }

    const [documents, total] = await Promise.all([
      this.collection.find(filter).sort(sort).skip(skip).limit(take).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return [documents.map((d) => this.mapToEntity(d)), total];
  }
}
