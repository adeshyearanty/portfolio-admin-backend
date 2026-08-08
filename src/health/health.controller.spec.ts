import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DatabaseService } from '../database/database.service';
import { IVectorStoreService } from '../interfaces/vector-store.interface';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;

  const mockDb = {
    command: jest.fn(),
    collection: jest.fn(),
  };

  const mockDatabaseService = {
    getDb: jest.fn().mockReturnValue(mockDb),
    collection: jest.fn(),
  };

  const mockVectorStore = {
    createCollection: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: IVectorStoreService, useValue: mockVectorStore },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return UP status when database is reachable', async () => {
      mockDb.command.mockResolvedValue({ ok: 1 });

      const result = await controller.getHealth();

      expect(result.status).toBe('UP');
      expect(result.database).toBe('UP');
      expect(mockDb.command).toHaveBeenCalledWith({ ping: 1 });
    });

    it('should throw 500 when database fails to ping', async () => {
      mockDb.command.mockRejectedValue(new Error('Connection failure'));

      await expect(controller.getHealth()).rejects.toThrow(HttpException);
      try {
        await controller.getHealth();
      } catch (err: unknown) {
        if (err instanceof HttpException) {
          expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              status: 'DOWN',
              database: 'DOWN',
              error: 'Connection failure',
            }),
          );
        }
      }
    });
  });

  describe('getReadiness', () => {
    it('should return status UP if database and vector store are healthy', async () => {
      mockDb.command.mockResolvedValue({ ok: 1 });
      mockVectorStore.createCollection.mockResolvedValue(undefined);

      const result = await controller.getReadiness();

      expect(result.status).toBe('UP');
      expect(result.components.database).toBe('UP');
      expect(result.components.vectorStore).toBe('UP');
    });

    it('should throw 503 if database fails', async () => {
      mockDb.command.mockRejectedValue(new Error('DB Timeout'));
      mockVectorStore.createCollection.mockResolvedValue(undefined);

      await expect(controller.getReadiness()).rejects.toThrow(HttpException);
      try {
        await controller.getReadiness();
      } catch (err: unknown) {
        if (err instanceof HttpException) {
          expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              status: 'DOWN',
              components: {
                database: 'DOWN',
                vectorStore: 'UP',
              },
            }),
          );
        }
      }
    });
  });

  describe('getMetrics', () => {
    it('should return memory and document aggregates from MongoDB', async () => {
      const mockCollection = {
        countDocuments: jest.fn().mockResolvedValue(5),
        aggregate: jest.fn().mockReturnValue({
          toArray: jest
            .fn()
            .mockResolvedValue([{ totalSizeBytes: 1048576, totalChunks: 20 }]),
        }),
      };
      mockDatabaseService.collection.mockReturnValue(mockCollection);

      const result = await controller.getMetrics();

      expect(result.documents.count).toBe(5);
      expect(result.documents.totalSizeBytes).toBe(1048576);
      expect(result.documents.totalChunks).toBe(20);
      expect(result.memory).toHaveProperty('rssMb');
      expect(result.memory).toHaveProperty('heapUsedMb');
    });
  });
});
