import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';
import { Inject } from '@nestjs/common';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IVectorStoreService)
    private readonly vectorStore: IVectorStoreService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness health check endpoint' })
  @ApiResponse({ status: 200, description: 'Liveness check succeeded' })
  @ApiResponse({ status: 500, description: 'System database is offline' })
  async getHealth() {
    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        database: 'UP',
      };
    } catch (err: any) {
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
    summary: 'Readiness check for all services (DB and ChromaDB)',
  })
  @ApiResponse({ status: 200, description: 'Readiness check succeeded' })
  @ApiResponse({
    status: 503,
    description: 'One or more integrations are offline',
  })
  async getReadiness() {
    let dbStatus = 'UP';
    let chromaStatus = 'UP';
    let hasError = false;
    const errors: Record<string, string> = {};

    // 1. Check Database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbStatus = 'DOWN';
      hasError = true;
      errors.database = err instanceof Error ? err.message : String(err);
    }

    // 2. Check ChromaDB
    try {
      const storeRecord = this.vectorStore as unknown as Record<
        string,
        unknown
      >;
      const client = storeRecord.client as Record<string, unknown> | undefined;
      if (client && typeof client.heartbeat === 'function') {
        const heartbeatFn = client.heartbeat as () => Promise<unknown>;
        await heartbeatFn.call(client);
      } else {
        await this.vectorStore.createCollection();
      }
    } catch (err) {
      chromaStatus = 'DOWN';
      hasError = true;
      errors.chromadb = err instanceof Error ? err.message : String(err);
    }

    const payload = {
      status: hasError ? 'DOWN' : 'UP',
      timestamp: new Date().toISOString(),
      components: {
        database: dbStatus,
        chromadb: chromaStatus,
      },
      ...(hasError ? { errors } : {}),
    };

    if (hasError) {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus-style or general telemetry metrics' })
  @ApiResponse({
    status: 200,
    description: 'Metrics payload retrieved successfully',
  })
  async getMetrics() {
    const memory = process.memoryUsage();

    // Get database aggregates
    const docCount = await this.prisma.knowledgeDocument.count();
    const sizeAgg = await this.prisma.knowledgeDocument.aggregate({
      _sum: { size: true },
    });
    const chunkAgg = await this.prisma.knowledgeDocument.aggregate({
      _sum: { chunkCount: true },
    });

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
        totalSizeBytes: sizeAgg._sum.size || 0,
        totalChunks: chunkAgg._sum.chunkCount || 0,
      },
    };
  }
}
