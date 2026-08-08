import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmModule } from '../llm/llm.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { ChatMemoryService } from './chat-memory.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [LlmModule, KnowledgeBaseModule],
  controllers: [ChatController, WhatsappWebhookController],
  providers: [ChatService, ChatMemoryService],
  exports: [ChatService, ChatMemoryService],
})
export class ChatModule {}
