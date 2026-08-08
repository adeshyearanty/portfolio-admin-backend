import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

describe('RetrievalService', () => {
  let service: RetrievalService;

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
        RetrievalService,
        {
          provide: IEmbeddingsService,
          useValue: mockEmbeddingsService,
        },
        {
          provide: IVectorStoreService,
          useValue: mockVectorStoreService,
        },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieve', () => {
    it('should generate embedding, run similarity search, filter by threshold and return mapped results', async () => {
      const mockQuery = 'What is NestJS?';
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsService.generateEmbedding.mockResolvedValue(mockEmbedding);

      // Distances from vector store search results.
      // Similarity = 1 - distance / 2
      // We want some above 0.75 (distance <= 0.25) and some below (distance > 0.25).
      const mockSearchResults = [
        {
          id: 'chunk-1',
          score: 0.1, // similarity = 1 - 0.1/2 = 0.95 (above 0.35)
          metadata: {
            documentId: 'doc-1',
            filename: 'nestjs.txt',
            chunkIndex: 0,
            text: 'NestJS is a framework.',
          },
        },
        {
          id: 'chunk-2',
          score: 0.2, // similarity = 1 - 0.2/2 = 0.90 (above 0.35)
          metadata: {
            documentId: 'doc-1',
            filename: 'nestjs.txt',
            chunkIndex: 1,
            text: 'It uses TypeScript.',
          },
        },
        {
          id: 'chunk-3',
          score: 1.5, // similarity = 1 - 1.5/2 = 0.25 (below 0.35)
          metadata: {
            documentId: 'doc-2',
            filename: 'other.txt',
            chunkIndex: 0,
            text: 'Unrelated content.',
          },
        },
      ];

      mockVectorStoreService.similaritySearch.mockResolvedValue(
        mockSearchResults,
      );

      const results = await service.retrieve(mockQuery);

      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockQuery,
      );
      expect(mockVectorStoreService.similaritySearch).toHaveBeenCalledWith(
        mockEmbedding,
        5,
      );

      // Assert filtering and shape
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        chunk: 'NestJS is a framework.',
        score: 0.95,
        metadata: {
          documentId: 'doc-1',
          filename: 'nestjs.txt',
          chunkIndex: 0,
        },
      });
      expect(results[1]).toEqual({
        chunk: 'It uses TypeScript.',
        score: 0.9,
        metadata: {
          documentId: 'doc-1',
          filename: 'nestjs.txt',
          chunkIndex: 1,
        },
      });
    });

    it('should return empty array if no search results match threshold', async () => {
      mockEmbeddingsService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      mockVectorStoreService.similaritySearch.mockResolvedValue([
        {
          id: 'chunk-3',
          score: 1.6, // similarity = 0.20 (below 0.35)
          metadata: {
            documentId: 'doc-2',
            filename: 'other.txt',
            chunkIndex: 0,
            text: 'Unrelated content.',
          },
        },
      ]);

      const results = await service.retrieve('test');
      expect(results).toHaveLength(0);
    });
  });
});
