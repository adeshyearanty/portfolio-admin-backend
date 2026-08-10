import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../llm/gemini.service';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { ChatMemoryService } from './chat-memory.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly geminiService: GeminiService,
    private readonly chatMemoryService: ChatMemoryService,
  ) {}

  async handleUserMessage(message: string, sessionId?: string) {
    this.logger.log(
      `Handling message: "${message}"${
        sessionId ? ` for session: ${sessionId}` : ''
      }`,
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

    // 4. Generate response using Gemini Service
    const answer = await this.geminiService.generateAnswer(
      message,
      contextWithMemory,
    );

    // 5. Save message exchange to memory if sessionId is active
    if (sessionId) {
      this.chatMemoryService.saveMessage(sessionId, 'user', message);
      this.chatMemoryService.saveMessage(sessionId, 'assistant', answer);
    }

    // 6. Format sources
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
}
