import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';
import { Inject } from '@nestjs/common';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(IVectorStoreService)
    private readonly vectorStore: IVectorStoreService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness health check endpoint' })
  @ApiResponse({ status: 200, description: 'Liveness check succeeded' })
  @ApiResponse({ status: 500, description: 'System database is offline' })
  async getHealth() {
    try {
      // Check database connectivity via ping
      await this.databaseService.getDb().command({ ping: 1 });
      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        database: 'UP',
      };
    } catch (err: unknown) {
      throw new HttpException(
        {
          status: 'DOWN',
          timestamp: new Date().toISOString(),
          database: 'DOWN',
          error: err instanceof Error ? err.message : String(err),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('readiness')
  @ApiOperation({
    summary: 'Readiness check for all services (Database and Vector Store)',
  })
  @ApiResponse({ status: 200, description: 'Readiness check succeeded' })
  @ApiResponse({
    status: 503,
    description: 'One or more integrations are offline',
  })
  async getReadiness() {
    let dbStatus = 'UP';
    let vectorStatus = 'UP';
    let hasError = false;
    const errors: Record<string, string> = {};

    // 1. Check Database
    try {
      await this.databaseService.getDb().command({ ping: 1 });
    } catch (err: unknown) {
      dbStatus = 'DOWN';
      hasError = true;
      errors.database = err instanceof Error ? err.message : String(err);
    }

    // 2. Check Vector Store
    try {
      await this.vectorStore.createCollection();
    } catch (err: unknown) {
      vectorStatus = 'DOWN';
      hasError = true;
      errors.vectorStore = err instanceof Error ? err.message : String(err);
    }

    const payload = {
      status: hasError ? 'DOWN' : 'UP',
      timestamp: new Date().toISOString(),
      components: {
        database: dbStatus,
        vectorStore: vectorStatus,
      },
      ...(hasError ? { errors } : {}),
    };

    if (hasError) {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Telemetry metrics and database aggregates' })
  @ApiResponse({
    status: 200,
    description: 'Metrics payload retrieved successfully',
  })
  async getMetrics() {
    const memory = process.memoryUsage();

    // Get database aggregates from MongoDB collection
    const collection = this.databaseService.collection('knowledge_documents');
    const docCount = await collection.countDocuments();
    const aggregates = await collection
      .aggregate<{ totalSizeBytes: number; totalChunks: number }>([
        {
          $group: {
            _id: null,
            totalSizeBytes: { $sum: '$size' },
            totalChunks: { $sum: '$chunkCount' },
          },
        },
      ])
      .toArray();

    const sizeSum = aggregates[0]?.totalSizeBytes || 0;
    const chunkSum = aggregates[0]?.totalChunks || 0;

    return {
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      documents: {
        count: docCount,
        totalSizeBytes: sizeSum,
        totalChunks: chunkSum,
      },
    };
  }
}
