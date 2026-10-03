import { Module } from '@nestjs/common';
import { NemotronService } from './nemotron.service';
import { ILlmService } from '../interfaces/llm-service.interface';

@Module({
  providers: [
    {
      provide: ILlmService,
      useClass: NemotronService,
    },
    NemotronService,
  ],
  exports: [ILlmService, NemotronService],
})
export class LlmModule {}
