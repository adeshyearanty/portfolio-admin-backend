import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: PrismaService;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    knowledgeDocument: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  const mockVectorStore = {
    createCollection: jest.fn(),
    insertVectors: jest.fn(),
    deleteDocument: jest.fn(),
    deleteCollection: jest.fn(),
    similaritySearch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IVectorStoreService, useValue: mockVectorStore },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth (Liveness)', () => {
    it('should return UP when database connection is healthy', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);

      const result = await controller.getHealth();

      expect(result.status).toBe('UP');
      expect(result.database).toBe('UP');

      const queryRawSpy = jest.spyOn(prisma, '$queryRaw');
      expect(queryRawSpy).toHaveBeenCalled();
    });

    it('should throw InternalServerError when database is offline', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection failure'));

      await expect(controller.getHealth()).rejects.toThrow(HttpException);

      try {
        await controller.getHealth();
      } catch (err: unknown) {
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        const responsePayload = httpErr.getResponse() as Record<
          string,
          unknown
        >;
        expect(responsePayload.status).toBe('DOWN');
        expect(typeof responsePayload.timestamp).toBe('string');
        expect(responsePayload.database).toBe('DOWN');
        expect(responsePayload.error).toBe('Connection failure');
      }
    });
  });

  describe('getReadiness', () => {
    it('should return status UP if database and ChromaDB are healthy', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(undefined);

      // Mock Chroma heartbeat without unsafe any casts
      const mockVectorStoreRecord = mockVectorStore as unknown as Record<
        string,
        unknown
      >;
      mockVectorStoreRecord.client = {
        heartbeat: jest.fn().mockResolvedValue(1234),
      };

      const result = await controller.getReadiness();

      expect(result.status).toBe('UP');
      expect(result.components.database).toBe('UP');
      expect(result.components.chromadb).toBe('UP');
    });

    it('should throw ServiceUnavailable if one component fails', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB Timeout'));

      // Mock Chroma heartbeat without unsafe any casts
      const mockVectorStoreRecord = mockVectorStore as unknown as Record<
        string,
        unknown
      >;
      mockVectorStoreRecord.client = {
        heartbeat: jest.fn().mockResolvedValue(1234),
      };

      await expect(controller.getReadiness()).rejects.toThrow(HttpException);

      try {
        await controller.getReadiness();
      } catch (err: unknown) {
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        const responsePayload = httpErr.getResponse() as Record<
          string,
          unknown
        >;
        expect(responsePayload.status).toBe('DOWN');
        expect(typeof responsePayload.timestamp).toBe('string');
        expect(responsePayload.components).toEqual({
          database: 'DOWN',
          chromadb: 'UP',
        });
        const errors = responsePayload.errors as Record<string, string>;
        expect(errors.database).toBe('DB Timeout');
      }
    });
  });

  describe('getMetrics', () => {
    it('should return structured memory and document aggregates', async () => {
      mockPrisma.knowledgeDocument.count.mockResolvedValue(5);
      mockPrisma.knowledgeDocument.aggregate.mockResolvedValueOnce({
        _sum: { size: 1024 },
      });
      mockPrisma.knowledgeDocument.aggregate.mockResolvedValueOnce({
        _sum: { chunkCount: 15 },
      });

      const result = await controller.getMetrics();

      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(result.documents.count).toBe(5);
      expect(result.documents.totalSizeBytes).toBe(1024);
      expect(result.documents.totalChunks).toBe(15);
      expect(result.memory).toBeDefined();
    });
  });
});
