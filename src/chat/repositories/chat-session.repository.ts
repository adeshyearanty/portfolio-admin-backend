import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Document, Collection } from 'mongodb';
import { randomUUID } from 'crypto';
import { ChatChannel } from '../enums/chat.enums';

export interface ChatSessionDoc extends Document {
  _id: string;
  visitorId: string;
  title: string;
  channel: ChatChannel;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
}

export interface ChatSessionEntity {
  id: string;
  visitorId: string;
  title: string;
  channel: ChatChannel;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
}

export interface ChatSessionWithCount extends ChatSessionEntity {
  messageCount: number;
}

@Injectable()
export class ChatSessionRepository implements OnModuleInit {
  private readonly logger = new Logger(ChatSessionRepository.name);
  private readonly collectionName = 'chat_sessions';

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    await this.ensureIndexes();
  }

  private get collection(): Collection<ChatSessionDoc> {
    return this.databaseService.collection<ChatSessionDoc>(
      this.collectionName,
    );
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.collection.createIndex(
        { visitorId: 1, lastMessageAt: -1 },
        { name: 'idx_visitor_lastMessage' },
      );
      this.logger.log('Chat session indexes ensured');
    } catch (error) {
      this.logger.warn(
        `Failed to create indexes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private mapToEntity(doc: ChatSessionDoc): ChatSessionEntity {
    return {
      id: doc._id,
      visitorId: doc.visitorId,
      title: doc.title,
      channel: doc.channel,
      createdAt:
        doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      updatedAt:
        doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
      lastMessageAt: doc.lastMessageAt
        ? doc.lastMessageAt instanceof Date
          ? doc.lastMessageAt
          : new Date(doc.lastMessageAt)
        : null,
    };
  }

  async create(params: {
    visitorId: string;
    title: string;
    channel: ChatChannel;
  }): Promise<ChatSessionEntity> {
    const now = new Date();
    const id = randomUUID();
    const doc: ChatSessionDoc = {
      _id: id,
      visitorId: params.visitorId,
      title: params.title,
      channel: params.channel,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    };

    await this.collection.insertOne(doc);
    return this.mapToEntity(doc);
  }

  async findById(id: string): Promise<ChatSessionEntity | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.mapToEntity(doc) : null;
  }

  async findByVisitorIdAndChannel(
    visitorId: string,
    channel: ChatChannel,
  ): Promise<ChatSessionWithCount[]> {
    const pipeline = [
      { $match: { visitorId, channel } },
      { $sort: { lastMessageAt: -1 as const } },
      {
        $lookup: {
          from: 'chat_messages',
          localField: '_id',
          foreignField: 'sessionId',
          as: 'messages',
        },
      },
      {
        $project: {
          _id: 1,
          visitorId: 1,
          title: 1,
          channel: 1,
          createdAt: 1,
          updatedAt: 1,
          lastMessageAt: 1,
          messageCount: { $size: '$messages' },
        },
      },
    ];

    const results = await this.collection
      .aggregate<ChatSessionDoc & { messageCount: number }>(pipeline)
      .toArray();

    return results.map((doc) => ({
      ...this.mapToEntity(doc),
      messageCount: doc.messageCount,
    }));
  }

  async update(
    id: string,
    data: Partial<Pick<ChatSessionDoc, 'title' | 'lastMessageAt'>>,
  ): Promise<ChatSessionEntity | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );

    return result ? this.mapToEntity(result) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }
}
