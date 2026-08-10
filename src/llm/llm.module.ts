import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ILlmService } from '../interfaces/llm-service.interface';

@Module({
  providers: [
    {
      provide: ILlmService,
      useClass: LlmService,
    },
    LlmService,
  ],
  exports: [ILlmService, LlmService],
})
export class LlmModule {}
