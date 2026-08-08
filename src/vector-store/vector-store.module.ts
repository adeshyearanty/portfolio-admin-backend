import { Module } from '@nestjs/common';
import { VectorStoreService } from './vector-store.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

@Module({
  providers: [
    {
      provide: IVectorStoreService,
      useClass: VectorStoreService,
    },
  ],
  exports: [IVectorStoreService],
})
export class VectorStoreModule {}
