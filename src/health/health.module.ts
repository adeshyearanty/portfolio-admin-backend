import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

@Module({
  imports: [PrismaModule, VectorStoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
