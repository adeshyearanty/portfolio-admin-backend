import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { IStorageService } from '../interfaces/storage-service.interface';

@Module({
  providers: [
    {
      provide: IStorageService,
      useClass: StorageService,
    },
  ],
  exports: [IStorageService],
})
export class StorageModule {}
