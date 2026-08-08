import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GeminiService } from './gemini.service';
import { ILlmService } from '../interfaces/llm-service.interface';

@Module({
  providers: [
    {
      provide: ILlmService,
      useClass: LlmService,
    },
    GeminiService,
  ],
  exports: [ILlmService, GeminiService],
})
export class LlmModule {}
