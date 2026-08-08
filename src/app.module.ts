import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import { validate } from './config/env.validation';
import { ChatModule } from './chat/chat.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { LlmModule } from './llm/llm.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    ChatModule,
    KnowledgeBaseModule,
    EmbeddingsModule,
    VectorStoreModule,
    LlmModule,
    StorageModule,
    HealthModule,
  ],
})
export class AppModule {}
