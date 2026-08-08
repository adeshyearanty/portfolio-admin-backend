import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import appConfig from './config/app.config';
import { validate } from './config/env.validation';
import { ChatModule } from './chat/chat.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { LlmModule } from './llm/llm.module';
import { StorageModule } from './storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

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
    // JwtModule.registerAsync({
    //   global: true,
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     secret: configService.get<string>('app.jwtSecret'),
    //     signOptions: { expiresIn: '1d' },
    //   }),
    // }),
    PrismaModule,
    ChatModule,
    KnowledgeBaseModule,
    EmbeddingsModule,
    VectorStoreModule,
    LlmModule,
    StorageModule,
    HealthModule,
  ],
  // providers: [
  //   {
  //     provide: APP_GUARD,
  //     useClass: ThrottlerGuard,
  //   },
  // ],
})
export class AppModule { }
