import { DatabaseService } from './database.service';
import { MongoClient, Db } from 'mongodb';

jest.mock('mongodb');

describe('DatabaseService', () => {
  let service: DatabaseService;
  const originalEnv = process.env;

  const mockDbInstance = {
    command: jest.fn(),
    collection: jest.fn(),
  };

  const mockDb = mockDbInstance as unknown as Db;

  const mockClient = {
    connect: jest.fn(),
    db: jest.fn().mockReturnValue(mockDb),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (MongoClient as unknown as jest.Mock).mockImplementation(() => mockClient);
    service = new DatabaseService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw an error onModuleInit if MONGODB_URI is not set', async () => {
    delete process.env.MONGODB_URI;
    await expect(service.onModuleInit()).rejects.toThrow(
      'MONGODB_URI is not configured',
    );
  });

  it('should connect, select database, and ping on onModuleInit', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    process.env.MONGODB_DATABASE = 'test_db';
    mockClient.connect.mockResolvedValue(undefined);
    mockDbInstance.command.mockResolvedValue({ ok: 1 });

    await service.onModuleInit();

    expect(MongoClient).toHaveBeenCalledTimes(1);
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.db).toHaveBeenCalledWith('test_db');
    expect(mockDbInstance.command).toHaveBeenCalledWith({ ping: 1 });
  });

  it('should return Db instance from getDb()', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    mockClient.connect.mockResolvedValue(undefined);
    mockDbInstance.command.mockResolvedValue({ ok: 1 });

    await service.onModuleInit();

    expect(service.getDb()).toBe(mockDb);
  });

  it('should throw if getDb() called before initialization', () => {
    expect(() => service.getDb()).toThrow('MongoDB has not been initialized');
  });

  it('should return collection from collection() helper', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    mockClient.connect.mockResolvedValue(undefined);
    mockDbInstance.command.mockResolvedValue({ ok: 1 });
    const mockCol = {};
    mockDbInstance.collection.mockReturnValue(mockCol);

    await service.onModuleInit();

    expect(service.collection('documents')).toBe(mockCol);
    expect(mockDbInstance.collection).toHaveBeenCalledWith('documents');
  });

  it('should close client on onModuleDestroy', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017';
    mockClient.connect.mockResolvedValue(undefined);
    mockDbInstance.command.mockResolvedValue({ ok: 1 });

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(mockClient.close).toHaveBeenCalledTimes(1);
  });
});
