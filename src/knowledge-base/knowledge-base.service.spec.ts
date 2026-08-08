import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from './knowledge-base.service';
import { IDocumentRepository } from './repositories/document.repository.interface';
import { IStorageService } from '../interfaces/storage-service.interface';
import { DocumentParserFactory } from './parsers/document-parser.factory';
import { ChunkService } from './chunk.service';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;

  const mockDocumentRepository = {
    create: jest.fn(),
    findManyAndCount: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockStorageService = {
    saveFile: jest.fn(),
    deleteFile: jest.fn(),
    getFile: jest.fn(),
  };

  const mockParser = {
    parse: jest.fn(),
  };

  const mockParserFactory = {
    getParser: jest.fn().mockReturnValue(mockParser),
  };

  const mockChunkService = {
    chunkDocument: jest.fn(),
  };

  const mockEmbeddingsService = {
    generateEmbedding: jest.fn(),
    generateEmbeddings: jest.fn(),
  };

  const mockVectorStoreService = {
    createCollection: jest.fn(),
    insertVectors: jest.fn(),
    deleteDocument: jest.fn(),
    deleteCollection: jest.fn(),
    similaritySearch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: IDocumentRepository, useValue: mockDocumentRepository },
        { provide: IStorageService, useValue: mockStorageService },
        { provide: DocumentParserFactory, useValue: mockParserFactory },
        { provide: ChunkService, useValue: mockChunkService },
        { provide: IEmbeddingsService, useValue: mockEmbeddingsService },
        { provide: IVectorStoreService, useValue: mockVectorStoreService },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadDocument', () => {
    const mockFile = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      size: 100,
      buffer: Buffer.from('hello world text content'),
    } as Express.Multer.File;

    it('should run successfully through pipeline stages and return completed record', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'test.txt',
        filename: 'unique.txt',
        status: 'PROCESSING',
      };

      mockDocumentRepository.create.mockResolvedValue(mockDoc);
      mockDocumentRepository.update.mockResolvedValue({
        ...mockDoc,
        status: 'COMPLETED',
        chunkCount: 2,
      });
      mockStorageService.saveFile.mockResolvedValue('/path/to/unique.txt');
      mockParser.parse.mockResolvedValue('parsed text content');
      mockChunkService.chunkDocument.mockReturnValue([
        { chunkText: 'chunk 1 text', estimatedTokens: 3 },
        { chunkText: 'chunk 2 text', estimatedTokens: 3 },
      ]);
      mockEmbeddingsService.generateEmbeddings.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      mockVectorStoreService.insertVectors.mockResolvedValue(undefined);

      const result = await service.uploadDocument(mockFile);

      expect(mockDocumentRepository.create).toHaveBeenCalled();
      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(mockParser.parse).toHaveBeenCalled();
      expect(mockChunkService.chunkDocument).toHaveBeenCalledWith(
        'doc-123',
        'parsed text content',
      );
      expect(mockEmbeddingsService.generateEmbeddings).toHaveBeenCalledWith([
        'chunk 1 text',
        'chunk 2 text',
      ]);
      expect(mockVectorStoreService.insertVectors).toHaveBeenCalled();
      expect(mockDocumentRepository.update).toHaveBeenCalledWith('doc-123', {
        status: 'COMPLETED',
        chunkCount: 2,
      });
      expect(result.status).toBe('COMPLETED');
    });

    it('should delete local file and record if pipeline fails', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'test.txt',
        filename: 'unique.txt',
        status: 'PROCESSING',
      };

      mockDocumentRepository.create.mockResolvedValue(mockDoc);
      mockStorageService.saveFile.mockResolvedValue('/path/to/unique.txt');
      mockParser.parse.mockResolvedValue('parsed text content');
      mockChunkService.chunkDocument.mockReturnValue([
        { chunkText: 'chunk 1 text', estimatedTokens: 3 },
      ]);
      mockEmbeddingsService.generateEmbeddings.mockRejectedValue(
        new Error('Embedding API failed'),
      );

      await expect(service.uploadDocument(mockFile)).rejects.toThrow(
        'Document pipeline failed: Embedding API failed',
      );

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockDocumentRepository.delete).toHaveBeenCalledWith('doc-123');
    });
  });

  describe('deleteDocument', () => {
    it('should delete file, remove vectors and clean db metadata', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'test.txt',
        filename: 'unique.txt',
      };

      mockDocumentRepository.findUnique.mockResolvedValue(mockDoc);
      mockDocumentRepository.delete.mockResolvedValue(mockDoc);

      const result = await service.deleteDocument('doc-123');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('unique.txt');
      expect(mockVectorStoreService.deleteDocument).toHaveBeenCalledWith(
        'doc-123',
      );
      expect(mockDocumentRepository.delete).toHaveBeenCalledWith('doc-123');
      expect(result.success).toBe(true);
    });

    it('should handle disk read errors and continue removing vectors and record', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'test.txt',
        filename: 'unique.txt',
      };

      mockDocumentRepository.findUnique.mockResolvedValue(mockDoc);
      mockStorageService.deleteFile.mockRejectedValue(
        new Error('Disk read-only'),
      );
      mockDocumentRepository.delete.mockResolvedValue(mockDoc);

      const result = await service.deleteDocument('doc-123');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('unique.txt');
      expect(mockVectorStoreService.deleteDocument).toHaveBeenCalledWith(
        'doc-123',
      );
      expect(mockDocumentRepository.delete).toHaveBeenCalledWith('doc-123');
      expect(result.success).toBe(true);
      expect(result.fileDeleted).toBe(false);
      expect(result.vectorsDeleted).toBe(true);
    });

    it('should handle vector DB disconnects and continue deleting database record', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'test.txt',
        filename: 'unique.txt',
      };

      mockDocumentRepository.findUnique.mockResolvedValue(mockDoc);
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockVectorStoreService.deleteDocument.mockRejectedValue(
        new Error('Chroma DB connection refused'),
      );
      mockDocumentRepository.delete.mockResolvedValue(mockDoc);

      const result = await service.deleteDocument('doc-123');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('unique.txt');
      expect(mockVectorStoreService.deleteDocument).toHaveBeenCalledWith(
        'doc-123',
      );
      expect(mockDocumentRepository.delete).toHaveBeenCalledWith('doc-123');
      expect(result.success).toBe(true);
      expect(result.fileDeleted).toBe(true);
      expect(result.vectorsDeleted).toBe(false);
    });
  });

  describe('getDocuments', () => {
    it('should call repository findManyAndCount with pagination parameters', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          filename: 'file1.txt',
          createdAt: new Date(),
          size: 100,
          chunkCount: 2,
        },
      ];
      mockDocumentRepository.findManyAndCount.mockResolvedValue([mockDocs, 1]);

      const result = await service.getDocuments({
        page: 1,
        limit: 10,
        search: 'file',
        sortBy: 'size',
        sortOrder: 'asc',
      });

      expect(mockDocumentRepository.findManyAndCount).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: 'file' } },
            { filename: { contains: 'file' } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: { size: 'asc' },
      });
      expect(result.data).toEqual([
        {
          id: 'doc-1',
          filename: 'file1.txt',
          createdAt: mockDocs[0].createdAt,
          size: 100,
          chunkCount: 2,
        },
      ]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('replaceDocumentFile', () => {
    const mockFile = {
      originalname: 'new-test.txt',
      mimetype: 'text/plain',
      size: 200,
      buffer: Buffer.from('new text contents'),
    } as Express.Multer.File;

    it('should complete replacement pipeline successfully', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'old-test.txt',
        filename: 'old-unique.txt',
        status: 'COMPLETED',
      };

      mockDocumentRepository.findUnique.mockResolvedValue(mockDoc);
      mockStorageService.saveFile.mockResolvedValue('/path/to/new-unique.txt');
      mockDocumentRepository.update.mockResolvedValue({
        ...mockDoc,
        title: 'new-test.txt',
        filename: 'new-unique.txt',
        size: 200,
        status: 'COMPLETED',
        chunkCount: 2,
      });
      mockParser.parse.mockResolvedValue('new parsed text content');
      mockChunkService.chunkDocument.mockReturnValue([
        { chunkText: 'chunk 1 text', estimatedTokens: 3 },
        { chunkText: 'chunk 2 text', estimatedTokens: 3 },
      ]);
      mockEmbeddingsService.generateEmbeddings.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      mockVectorStoreService.deleteDocument.mockResolvedValue(undefined);
      mockVectorStoreService.insertVectors.mockResolvedValue(undefined);
      mockStorageService.deleteFile.mockResolvedValue(undefined);

      const result = await service.replaceDocumentFile('doc-123', mockFile);

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(mockParser.parse).toHaveBeenCalled();
      expect(mockChunkService.chunkDocument).toHaveBeenCalledWith(
        'doc-123',
        'new parsed text content',
      );
      expect(mockEmbeddingsService.generateEmbeddings).toHaveBeenCalledWith([
        'chunk 1 text',
        'chunk 2 text',
      ]);
      expect(mockVectorStoreService.deleteDocument).toHaveBeenCalledWith(
        'doc-123',
      );
      expect(mockVectorStoreService.insertVectors).toHaveBeenCalled();
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'old-unique.txt',
      );
      expect(result.status).toBe('COMPLETED');
      expect(result.chunkCount).toBe(2);
    });

    it('should rollback and restore state if pipeline fails', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'old-test.txt',
        filename: 'old-unique.txt',
        status: 'COMPLETED',
      };

      mockDocumentRepository.findUnique.mockResolvedValue(mockDoc);
      mockStorageService.saveFile.mockResolvedValue('/path/to/new-unique.txt');
      mockParser.parse.mockResolvedValue('new parsed text content');
      mockChunkService.chunkDocument.mockReturnValue([
        { chunkText: 'chunk 1 text', estimatedTokens: 3 },
      ]);
      mockEmbeddingsService.generateEmbeddings.mockRejectedValue(
        new Error('Embedding API failed'),
      );

      await expect(
        service.replaceDocumentFile('doc-123', mockFile),
      ).rejects.toThrow('Document replacement failed: Embedding API failed');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockDocumentRepository.update).toHaveBeenCalledWith('doc-123', {
        status: 'COMPLETED',
      });
    });
  });
});
