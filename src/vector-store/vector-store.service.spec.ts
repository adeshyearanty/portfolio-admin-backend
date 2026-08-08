/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { VectorStoreService } from './vector-store.service';
import { ConfigService } from '@nestjs/config';

// Mock chromadb package
jest.mock('chromadb', () => {
  const mockCollection = {
    add: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ids: [['chunk-1']],
        distances: [[0.15]],
        metadatas: [
          [
            {
              documentId: 'doc-1',
              filename: 'test.txt',
              chunkIndex: '0',
              text: 'mock chunk text contents',
            },
          ],
        ],
      });
    }),
  };

  const mockClient = {
    getOrCreateCollection: jest.fn().mockResolvedValue(mockCollection),
    deleteCollection: jest.fn().mockResolvedValue(undefined),
  };

  return {
    ChromaClient: jest.fn().mockImplementation(() => mockClient),
  };
});

describe('VectorStoreService', () => {
  let service: VectorStoreService;
  let mockClientInstance: any;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'app.chromaHost') return 'localhost';
        if (key === 'app.chromaPort') return '8000';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VectorStoreService>(VectorStoreService);
    mockClientInstance = (service as any).client;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCollection', () => {
    it('should query getOrCreateCollection with portfolio-kb', async () => {
      await service.createCollection();
      expect(mockClientInstance.getOrCreateCollection).toHaveBeenCalledWith({
        name: 'portfolio-kb',
        metadata: { 'hnsw:space': 'cosine' },
      });
    });
  });

  describe('insertVectors', () => {
    it('should add items to the collection', async () => {
      const ids = ['id-1'];
      const embeddings = [[0.1, 0.2]];
      const metadatas = [
        {
          documentId: 'doc-123',
          filename: 'resume.pdf',
          chunkIndex: 0,
          text: 'resume chunk text',
        },
      ];
      const documents = ['resume chunk text'];

      await service.insertVectors(ids, embeddings, metadatas, documents);

      const mockCollection = await mockClientInstance.getOrCreateCollection();
      expect(mockCollection.add).toHaveBeenCalledWith({
        ids,
        embeddings,
        metadatas,
        documents,
      });
    });
  });

  describe('deleteDocument', () => {
    it('should delete from collection using where filter', async () => {
      await service.deleteDocument('doc-123');

      const mockCollection = await mockClientInstance.getOrCreateCollection();
      expect(mockCollection.delete).toHaveBeenCalledWith({
        where: { documentId: 'doc-123' },
      });
    });
  });

  describe('deleteCollection', () => {
    it('should drop the collection using deleteCollection client method', async () => {
      await service.deleteCollection();
      expect(mockClientInstance.deleteCollection).toHaveBeenCalledWith({
        name: 'portfolio-kb',
      });
    });
  });

  describe('similaritySearch', () => {
    it('should perform similarity search query and return formatted results', async () => {
      const results = await service.similaritySearch([0.15, 0.25], 3);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({
        id: 'chunk-1',
        score: 0.15,
        metadata: {
          documentId: 'doc-1',
          filename: 'test.txt',
          chunkIndex: 0,
          text: 'mock chunk text contents',
        },
      });

      const mockCollection = await mockClientInstance.getOrCreateCollection();
      expect(mockCollection.query).toHaveBeenCalledWith({
        queryEmbeddings: [[0.15, 0.25]],
        nResults: 3,
      });
    });
  });
});
