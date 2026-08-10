import { Injectable, Logger } from '@nestjs/common';
import {
  ChatMessageRepository,
  ChatMessageEntity,
} from './repositories/chat-message.repository';
import { ChatRole, MessageStatus } from './enums/chat.enums';

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    private readonly messageRepository: ChatMessageRepository,
  ) {}

  async saveUserMessage(
    sessionId: string,
    visitorId: string,
    content: string,
  ): Promise<ChatMessageEntity> {
    const message = await this.messageRepository.create({
      sessionId,
      visitorId,
      role: ChatRole.USER,
      content,
      status: MessageStatus.COMPLETED,
    });

    this.logger.log(
      `Saved user message ${message.id} for session ${sessionId}`,
    );
    return message;
  }

  async createAssistantMessage(
    sessionId: string,
    visitorId: string,
  ): Promise<ChatMessageEntity> {
    const message = await this.messageRepository.create({
      sessionId,
      visitorId,
      role: ChatRole.ASSISTANT,
      content: '',
      status: MessageStatus.STREAMING,
    });

    this.logger.log(
      `Created streaming assistant message ${message.id} for session ${sessionId}`,
    );
    return message;
  }

  async completeMessage(
    messageId: string,
    finalContent: string,
  ): Promise<ChatMessageEntity | null> {
    const message = await this.messageRepository.updateContent(
      messageId,
      finalContent,
      MessageStatus.COMPLETED,
    );

    if (message) {
      this.logger.log(`Completed assistant message ${messageId}`);
    }
    return message;
  }

  async failMessage(
    messageId: string,
    partialContent: string,
  ): Promise<ChatMessageEntity | null> {
    const message = await this.messageRepository.updateContent(
      messageId,
      partialContent,
      MessageStatus.FAILED,
    );

    if (message) {
      this.logger.warn(`Failed assistant message ${messageId}`);
    }
    return message;
  }

  async getSessionMessages(
    sessionId: string,
    limit = 100,
  ): Promise<ChatMessageEntity[]> {
    return this.messageRepository.findBySessionId(sessionId, limit);
  }
}
