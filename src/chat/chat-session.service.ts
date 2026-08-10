import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ChatSessionRepository,
  ChatSessionEntity,
  ChatSessionWithCount,
} from './repositories/chat-session.repository';
import { ChatMessageRepository } from './repositories/chat-message.repository';
import { ChatChannel } from './enums/chat.enums';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly messageRepository: ChatMessageRepository,
  ) {}

  async createSession(
    visitorId: string,
    channel: ChatChannel,
  ): Promise<ChatSessionEntity> {
    const session = await this.sessionRepository.create({
      visitorId,
      title: 'New conversation',
      channel,
    });

    this.logger.log(
      `Created session ${session.id} for visitor ${visitorId} [${channel}]`,
    );
    return session;
  }

  async getSessions(
    visitorId: string,
    channel: ChatChannel,
  ): Promise<ChatSessionWithCount[]> {
    return this.sessionRepository.findByVisitorIdAndChannel(
      visitorId,
      channel,
    );
  }

  async getConversation(
    sessionId: string,
    visitorId: string,
  ): Promise<{
    session: ChatSessionEntity;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      status: string;
      createdAt: Date;
    }>;
  }> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    // Mark stale streaming messages as failed
    const staleCount =
      await this.messageRepository.markStaleStreamingAsFailed(sessionId);
    if (staleCount > 0) {
      this.logger.warn(
        `Marked ${staleCount} stale streaming messages as FAILED in session ${sessionId}`,
      );
    }

    const messages = await this.messageRepository.findBySessionId(sessionId);

    return {
      session,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        createdAt: m.createdAt,
      })),
    };
  }

  async deleteSession(sessionId: string, visitorId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    const deletedMessages =
      await this.messageRepository.deleteBySessionId(sessionId);
    await this.sessionRepository.delete(sessionId);

    this.logger.log(
      `Deleted session ${sessionId} and ${deletedMessages} associated messages`,
    );
  }

  async validateSessionOwnership(
    sessionId: string,
    visitorId: string,
  ): Promise<ChatSessionEntity> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    return session;
  }

  async updateSessionTitle(
    sessionId: string,
    firstMessage: string,
  ): Promise<void> {
    const title = this.generateTitle(firstMessage);
    await this.sessionRepository.update(sessionId, { title });
  }

  async updateLastMessageAt(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastMessageAt: new Date(),
    });
  }

  private generateTitle(message: string): string {
    // Clean up the message: remove excess whitespace and newlines
    const cleaned = message.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= 50) {
      return cleaned;
    }

    // Try to break at a word boundary
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 30) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}
