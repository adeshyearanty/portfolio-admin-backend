import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatSessionService } from './chat-session.service';
import { ChatMessageService } from './chat-message.service';
import { ChatGateway } from './chat.gateway';
import { LlmModule } from '../llm/llm.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { ChatMemoryService } from './chat-memory.service';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatMessageRepository } from './repositories/chat-message.repository';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppMessageFormatter } from './whatsapp-message-formatter.service';

@Module({
  imports: [LlmModule, KnowledgeBaseModule],
  controllers: [ChatController, WhatsappWebhookController],
  providers: [
    ChatSessionRepository,
    ChatMessageRepository,
    ChatService,
    ChatSessionService,
    ChatMessageService,
    ChatMemoryService,
    ChatGateway,
    WhatsAppMessageFormatter,
  ],
  exports: [
    ChatService,
    ChatSessionService,
    ChatMessageService,
    ChatMemoryService,
    WhatsAppMessageFormatter,
  ],
})
export class ChatModule {}
