import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { ChatMemoryService } from './chat-memory.service';
import { ChatMessageService } from './chat-message.service';
import { ChatSessionService } from './chat-session.service';
import { WhatsAppMessageFormatter } from './whatsapp-message-formatter.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatChannel } from './enums/chat.enums';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly llmService: LlmService,
    private readonly chatMemoryService: ChatMemoryService,
    private readonly whatsappFormatter: WhatsAppMessageFormatter,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  /**
   * Original non-streaming handler — used by WhatsApp webhook and POST /chat.
   * Kept intact for backward compatibility.
   */
  async handleUserMessage(
    message: string,
    sessionId?: string,
    channel: 'web' | 'whatsapp' = 'web',
  ): Promise<ChatResponseDto> {
    this.logger.log(
      `Handling message: "${message}"${
        sessionId ? ` for session: ${sessionId}` : ''
      } [channel: ${channel}]`,
    );

    // 1. Retrieve top chunks using RetrievalService
    const retrieved = await this.retrievalService.retrieve(message);
    this.logger.log(`Retrieved ${retrieved.length} relevant chunks`);

    // 2. Build context block from retrieved chunks
    const contextText =
      retrieved.length > 0
        ? retrieved
            .map(
              (item, index) =>
                `[Source ${index + 1} - ${item.metadata.filename}]:\n${item.chunk}`,
            )
            .join('\n\n')
        : '';

    // 3. Retrieve and format conversation memory if sessionId is provided
    let contextWithMemory = contextText;
    if (sessionId) {
      const history = this.chatMemoryService.getHistory(sessionId);
      if (history.length > 0) {
        const historyText = history
          .map(
            (msg) =>
              `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`,
          )
          .join('\n');
        contextWithMemory = contextText
          ? `Conversation History:\n${historyText}\n\nContext:\n${contextText}`
          : `Conversation History:\n${historyText}`;
      }
    }

    // 4. Generate response using LLM Service with target channel awareness
    const rawAnswer = await this.llmService.generateAnswer(
      message,
      contextWithMemory,
      channel,
    );

    // 5. Normalize formatting for target channel
    const answer =
      channel === 'whatsapp'
        ? this.whatsappFormatter.format(rawAnswer)
        : rawAnswer;

    // 6. Save message exchange to memory if sessionId is active
    if (sessionId) {
      this.chatMemoryService.saveMessage(sessionId, 'user', message);
      this.chatMemoryService.saveMessage(sessionId, 'assistant', answer);
    }

    // 7. Format sources
    const sources = retrieved.map((item) => ({
      documentId: item.metadata.documentId,
      filename: item.metadata.filename,
      chunkIndex: item.metadata.chunkIndex,
    }));

    return {
      answer,
      sources,
    };
  }

  /**
   * Streaming handler for WebSocket-based chat.
   * Persists messages to MongoDB, streams via AsyncGenerator.
   */
  async *handleStreamingMessage(
    sessionId: string,
    visitorId: string,
    message: string,
  ): AsyncGenerator<
    | { type: 'start'; messageId: string }
    | { type: 'chunk'; messageId: string; chunk: string }
    | { type: 'complete'; messageId: string; content: string }
    | { type: 'error'; messageId: string; error: string },
    void,
    unknown
  > {
    this.logger.log(
      `Handling streaming message for session ${sessionId}: "${message.substring(0, 50)}..."`,
    );

    // 1. Validate session ownership
    const session = await this.chatSessionService.validateSessionOwnership(
      sessionId,
      visitorId,
    );

    if (session.channel !== ChatChannel.WEB) {
      throw new Error('Session channel mismatch');
    }

    // 2. Save user message
    await this.chatMessageService.saveUserMessage(
      sessionId,
      visitorId,
      message,
    );

    // 3. Update session title if this is the first real message
    if (session.title === 'New conversation') {
      await this.chatSessionService.updateSessionTitle(sessionId, message);
    }

    // 4. Load conversation history from MongoDB for context
    const previousMessages =
      await this.chatMessageService.getSessionMessages(sessionId);
    const historyForContext = previousMessages
      .filter((m) => m.content.length > 0)
      .slice(-10)
      .map(
        (m) =>
          `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content}`,
      )
      .join('\n');

    // 5. RAG retrieval
    const retrieved = await this.retrievalService.retrieve(message);
    this.logger.log(
      `Retrieved ${retrieved.length} relevant chunks for streaming`,
    );

    const contextText =
      retrieved.length > 0
        ? retrieved
            .map(
              (item, index) =>
                `[Source ${index + 1} - ${item.metadata.filename}]:\n${item.chunk}`,
            )
            .join('\n\n')
        : '';

    const fullContext = historyForContext
      ? `Conversation History:\n${historyForContext}\n\nContext:\n${contextText}`
      : contextText;

    // 6. Create assistant message in STREAMING state
    const assistantMessage =
      await this.chatMessageService.createAssistantMessage(
        sessionId,
        visitorId,
      );

    yield { type: 'start', messageId: assistantMessage.id };

    // 7. Stream from LLM
    let accumulatedContent = '';

    try {
      const stream = this.llmService.generateAnswerStream(
        message,
        fullContext,
        'web',
      );

      for await (const chunk of stream) {
        accumulatedContent += chunk;
        yield { type: 'chunk', messageId: assistantMessage.id, chunk };
      }

      // 8. Complete — update assistant message
      await this.chatMessageService.completeMessage(
        assistantMessage.id,
        accumulatedContent,
      );
      await this.chatSessionService.updateLastMessageAt(sessionId);

      // Also save to in-memory for any in-process follow-ups
      this.chatMemoryService.saveMessage(sessionId, 'user', message);
      this.chatMemoryService.saveMessage(
        sessionId,
        'assistant',
        accumulatedContent,
      );

      yield {
        type: 'complete',
        messageId: assistantMessage.id,
        content: accumulatedContent,
      };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Streaming failed for message ${assistantMessage.id}: ${errorMsg}`,
      );

      // Mark message as failed with whatever content was accumulated
      await this.chatMessageService.failMessage(
        assistantMessage.id,
        accumulatedContent,
      );
      await this.chatSessionService.updateLastMessageAt(sessionId);

      yield {
        type: 'error',
        messageId: assistantMessage.id,
        error: 'Failed to generate response. Please try again.',
      };
    }
  }
}
