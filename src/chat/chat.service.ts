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

    // If no context matched the threshold, we immediately return the fallback text
    // as per: "If information is missing say 'I couldn't find that information in my knowledge base.'"
    if (retrieved.length === 0) {
      const fallbackAnswer =
        "I couldn't find that information in my knowledge base.";
      if (sessionId) {
        this.chatMemoryService.saveMessage(sessionId, 'user', message);
        this.chatMemoryService.saveMessage(
          sessionId,
          'assistant',
          fallbackAnswer,
        );
      }
      return {
        answer: fallbackAnswer,
        sources: [],
      };
    }

    // 2. Build context block
    const contextText = retrieved
      .map(
        (item, index) =>
          `[Source ${index + 1} - ${item.metadata.filename}]:\n${item.chunk}`,
      )
      .join('\n\n');

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
        contextWithMemory = `Conversation History:\n${historyText}\n\nContext:\n${contextText}`;
      }
    }

    // 4. Define system instructions
    const systemInstruction = `You are Adesh's AI assistant.
Only answer using supplied context.
Never hallucinate.
If information is missing say "I couldn't find that information in my knowledge base."`;

    // 5. Generate response using Gemini Service (gemini-2.5-flash)
    const answer = await this.geminiService.generateAnswer(
      message,
      contextWithMemory,
      systemInstruction,
    );

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
}
