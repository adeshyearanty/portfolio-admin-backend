import { MongoDocumentRepository } from './mongo-document.repository';
import { DatabaseService } from '../../database/database.service';

describe('MongoDocumentRepository', () => {
  let repository: MongoDocumentRepository;

  const mockCursor = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn(),
  };

  const mockCollection = {
    insertOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn().mockReturnValue(mockCursor),
    countDocuments: jest.fn(),
  };

  const mockDatabaseService = {
    collection: jest.fn().mockReturnValue(mockCollection),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new MongoDocumentRepository(
      mockDatabaseService as unknown as DatabaseService,
    );
  });

  describe('create', () => {
    it('should insert and return a mapped document entity', async () => {
      const now = new Date();
      mockCollection.insertOne.mockResolvedValue({ acknowledged: true });

      const result = await repository.create({
        id: 'doc-123',
        title: 'Resume',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        createdAt: now,
        updatedAt: now,
      });

      expect(mockDatabaseService.collection).toHaveBeenCalledWith(
        'knowledge_documents',
      );
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'doc-123',
          id: 'doc-123',
          title: 'Resume',
          status: 'PROCESSING',
          chunkCount: 0,
        }),
      );
      expect(result).toEqual({
        id: 'doc-123',
        title: 'Resume',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'PROCESSING',
        chunkCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  describe('update', () => {
    it('should findOneAndUpdate and return updated document', async () => {
      const now = new Date();
      const updatedDoc = {
        _id: 'doc-123',
        id: 'doc-123',
        title: 'Resume Updated',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'COMPLETED',
        chunkCount: 5,
        createdAt: now,
        updatedAt: now,
      };
      mockCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const result = await repository.update('doc-123', {
        title: 'Resume Updated',
        status: 'COMPLETED',
        chunkCount: 5,
      });

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw if document to update is not found', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        repository.update('non-existent', { title: 'New' }),
      ).rejects.toThrow('Knowledge document with ID non-existent not found');
    });
  });

  describe('delete', () => {
    it('should delete and return document', async () => {
      const now = new Date();
      const existingDoc = {
        _id: 'doc-123',
        id: 'doc-123',
        title: 'Resume',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'COMPLETED',
        chunkCount: 2,
        createdAt: now,
        updatedAt: now,
      };
      mockCollection.findOne.mockResolvedValue(existingDoc);
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await repository.delete('doc-123');

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        $or: [{ _id: 'doc-123' }, { id: 'doc-123' }],
      });
      expect(result.id).toBe('doc-123');
    });

    it('should throw if document to delete is not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await expect(repository.delete('non-existent')).rejects.toThrow(
        'Knowledge document with ID non-existent not found',
      );
    });
  });

  describe('findUnique', () => {
    it('should return document if found', async () => {
      const now = new Date();
      mockCollection.findOne.mockResolvedValue({
        _id: 'doc-123',
        id: 'doc-123',
        title: 'Resume',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'COMPLETED',
        chunkCount: 2,
        createdAt: now,
        updatedAt: now,
      });

      const result = await repository.findUnique('doc-123');
      expect(result?.id).toBe('doc-123');
    });

    it('should return null if not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);
      const result = await repository.findUnique('doc-123');
      expect(result).toBeNull();
    });
  });

  describe('findManyAndCount', () => {
    it('should handle search filter, sorting, pagination, and return documents with total count', async () => {
      const now = new Date();
      const docs = [
        {
          _id: 'doc-1',
          id: 'doc-1',
          title: 'NestJS Guide',
          filename: 'guide.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          status: 'COMPLETED',
          chunkCount: 4,
          createdAt: now,
          updatedAt: now,
        },
      ];
      mockCursor.toArray.mockResolvedValue(docs);
      mockCollection.countDocuments.mockResolvedValue(1);

      const [results, total] = await repository.findManyAndCount({
        where: {
          OR: [
            { title: { contains: 'Nest' } },
            { filename: { contains: 'Nest' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });

      expect(mockCollection.find).toHaveBeenCalledWith({
        $or: [
          { title: { $regex: 'Nest', $options: 'i' } },
          { filename: { $regex: 'Nest', $options: 'i' } },
        ],
      });
      expect(mockCursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockCursor.skip).toHaveBeenCalledWith(0);
      expect(mockCursor.limit).toHaveBeenCalledWith(10);
      expect(results).toHaveLength(1);
      expect(total).toBe(1);
    });
  });
});
