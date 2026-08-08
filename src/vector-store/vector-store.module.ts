import { Module } from '@nestjs/common';
import { MongoVectorStoreService } from './mongo-vector-store.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

@Module({
  providers: [
    MongoVectorStoreService,
    {
      provide: IVectorStoreService,
      useExisting: MongoVectorStoreService,
    },
  ],
  exports: [IVectorStoreService, MongoVectorStoreService],
})
export class VectorStoreModule {}
