import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Document, Collection } from 'mongodb';
import { randomUUID } from 'crypto';
import { ChatRole, MessageStatus } from '../enums/chat.enums';

export interface ChatMessageDoc extends Document {
  _id: string;
  sessionId: string;
  visitorId: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageEntity {
  id: string;
  sessionId: string;
  visitorId: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ChatMessageRepository implements OnModuleInit {
  private readonly logger = new Logger(ChatMessageRepository.name);
  private readonly collectionName = 'chat_messages';

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    await this.ensureIndexes();
  }

  private get collection(): Collection<ChatMessageDoc> {
    return this.databaseService.collection<ChatMessageDoc>(
      this.collectionName,
    );
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.collection.createIndex(
        { sessionId: 1, createdAt: 1 },
        { name: 'idx_session_createdAt' },
      );
      await this.collection.createIndex(
        { visitorId: 1, sessionId: 1 },
        { name: 'idx_visitor_session' },
      );
      this.logger.log('Chat message indexes ensured');
    } catch (error) {
      this.logger.warn(
        `Failed to create indexes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private mapToEntity(doc: ChatMessageDoc): ChatMessageEntity {
    return {
      id: doc._id,
      sessionId: doc.sessionId,
      visitorId: doc.visitorId,
      role: doc.role,
      content: doc.content,
      status: doc.status,
      createdAt:
        doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      updatedAt:
        doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
    };
  }

  async create(params: {
    sessionId: string;
    visitorId: string;
    role: ChatRole;
    content: string;
    status: MessageStatus;
  }): Promise<ChatMessageEntity> {
    const now = new Date();
    const id = randomUUID();
    const doc: ChatMessageDoc = {
      _id: id,
      sessionId: params.sessionId,
      visitorId: params.visitorId,
      role: params.role,
      content: params.content,
      status: params.status,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.insertOne(doc);
    return this.mapToEntity(doc);
  }

  async findBySessionId(
    sessionId: string,
    limit = 100,
  ): Promise<ChatMessageEntity[]> {
    const docs = await this.collection
      .find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    return docs.map((d) => this.mapToEntity(d));
  }

  async updateContent(
    id: string,
    content: string,
    status: MessageStatus,
  ): Promise<ChatMessageEntity | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: { content, status, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );

    return result ? this.mapToEntity(result) : null;
  }

  async markStaleStreamingAsFailed(
    sessionId: string,
    timeoutMs = 3 * 60 * 1000,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);
    const result = await this.collection.updateMany(
      {
        sessionId,
        status: MessageStatus.STREAMING,
        createdAt: { $lt: cutoff },
      },
      {
        $set: {
          status: MessageStatus.FAILED,
          updatedAt: new Date(),
        },
      },
    );

    return result.modifiedCount;
  }

  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await this.collection.deleteMany({ sessionId });
    return result.deletedCount;
  }
}
