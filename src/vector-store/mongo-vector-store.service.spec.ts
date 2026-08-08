import { MongoVectorStoreService } from './mongo-vector-store.service';
import { DatabaseService } from '../database/database.service';
import { BadRequestException } from '@nestjs/common';

describe('MongoVectorStoreService', () => {
  let service: MongoVectorStoreService;

  const mockCursor = {
    toArray: jest.fn(),
  };

  const mockAggregateCursor = {
    toArray: jest.fn(),
  };

  const mockCollection = {
    createIndex: jest.fn(),
    insertMany: jest.fn(),
    deleteMany: jest.fn(),
    find: jest.fn().mockReturnValue(mockCursor),
    aggregate: jest.fn().mockReturnValue(mockAggregateCursor),
  };

  const mockDatabaseService = {
    collection: jest.fn().mockReturnValue(mockCollection),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MongoVectorStoreService(
      mockDatabaseService as unknown as DatabaseService,
    );
  });

  describe('createCollection', () => {
    it('should create index on documentId and chunkIndex', async () => {
      mockCollection.createIndex.mockResolvedValue('index_name');
      await service.createCollection();
      expect(mockCollection.createIndex).toHaveBeenCalledWith({
        documentId: 1,
        chunkIndex: 1,
      });
    });
  });

  describe('insertVectors', () => {
    it('should reject mismatched array lengths', async () => {
      await expect(
        service.insertVectors(['id1'], [[0.1, 0.2]], [], ['text1']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid embeddings', async () => {
      await expect(
        service.insertVectors(
          ['id1'],
          [[]], // empty embedding
          [
            {
              documentId: 'doc1',
              filename: 'test.pdf',
              chunkIndex: 0,
              text: 'text1',
            },
          ],
          ['text1'],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should insert self-contained chunk documents', async () => {
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
      mockCollection.insertMany.mockResolvedValue({ acknowledged: true });

      const ids = ['doc1-chunk-0', 'doc1-chunk-1'];
      const embeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      const metadatas = [
        {
          documentId: 'doc1',
          filename: 'test.pdf',
          chunkIndex: 0,
          text: 'Chunk 1',
        },
        {
          documentId: 'doc1',
          filename: 'test.pdf',
          chunkIndex: 1,
          text: 'Chunk 2',
        },
      ];
      const documents = ['Chunk 1', 'Chunk 2'];

      await service.insertVectors(ids, embeddings, metadatas, documents);

      expect(mockCollection.deleteMany).toHaveBeenCalled();
      expect(mockCollection.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _id: 'doc1-chunk-0',
            documentId: 'doc1',
            chunkIndex: 0,
            content: 'Chunk 1',
            embedding: [0.1, 0.2],
          }),
          expect.objectContaining({
            _id: 'doc1-chunk-1',
            documentId: 'doc1',
            chunkIndex: 1,
            content: 'Chunk 2',
            embedding: [0.3, 0.4],
          }),
        ]),
        { ordered: true },
      );
    });
  });

  describe('deleteDocument', () => {
    it('should delete all chunks matching documentId', async () => {
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });
      await service.deleteDocument('doc1');
      expect(mockCollection.deleteMany).toHaveBeenCalledWith({
        documentId: 'doc1',
      });
    });
  });

  describe('deleteCollection', () => {
    it('should delete all chunks in collection', async () => {
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 10 });
      await service.deleteCollection();
      expect(mockCollection.deleteMany).toHaveBeenCalledWith({});
    });
  });

  describe('similaritySearch', () => {
    it('should reject invalid query embeddings', async () => {
      await expect(service.similaritySearch([])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use $vectorSearch aggregation pipeline if available', async () => {
      const mockResult = [
        {
          _id: 'doc1-chunk-0',
          documentId: 'doc1',
          chunkIndex: 0,
          content: 'NestJS is a backend framework.',
          score: 0.9,
          metadata: {
            filename: 'nestjs.txt',
          },
        },
      ];
      mockAggregateCursor.toArray.mockResolvedValue(mockResult);

      const results = await service.similaritySearch([0.1, 0.2], 5);

      expect(mockCollection.aggregate).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc1-chunk-0');
      expect(results[0].metadata.text).toBe('NestJS is a backend framework.');
    });

    it('should fallback to in-memory cosine similarity if $vectorSearch is unavailable', async () => {
      mockAggregateCursor.toArray.mockRejectedValue(
        new Error('$vectorSearch not supported on local instance'),
      );
      mockCursor.toArray.mockResolvedValue([
        {
          _id: 'doc1-chunk-0',
          documentId: 'doc1',
          chunkIndex: 0,
          content: 'NestJS is a framework.',
          embedding: [1, 0],
          metadata: {
            filename: 'nestjs.txt',
          },
        },
        {
          _id: 'doc1-chunk-1',
          documentId: 'doc1',
          chunkIndex: 1,
          content: 'Unrelated topic.',
          embedding: [0, 1],
          metadata: {
            filename: 'other.txt',
          },
        },
      ]);

      const results = await service.similaritySearch([1, 0], 2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1-chunk-0');
      expect(results[0].score).toBeCloseTo(0, 4); // distance for identical vector = 0
    });
  });
});
