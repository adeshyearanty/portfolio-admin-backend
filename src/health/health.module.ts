import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [VectorStoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
