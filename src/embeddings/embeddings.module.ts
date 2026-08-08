import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';

@Module({
  providers: [
    {
      provide: IEmbeddingsService,
      useClass: EmbeddingsService,
    },
  ],
  exports: [IEmbeddingsService],
})
export class EmbeddingsModule {}
