import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingsService } from './embeddings.service';
import { ConfigService } from '@nestjs/config';

// Mock @huggingface/transformers module
const mockExtractor = jest.fn();
const mockPipeline = jest.fn().mockResolvedValue(mockExtractor);

jest.mock('@huggingface/transformers', () => {
  return {
    pipeline: mockPipeline,
  };
});

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockExtractor.mockImplementation((texts: string | string[]) => {
      const isBatch = Array.isArray(texts);
      if (isBatch) {
        const arr = texts as string[];
        return Promise.resolve({
          dims: [arr.length, 384],
          data: new Float32Array(arr.length * 384).fill(0.15),
        });
      } else {
        return Promise.resolve({
          dims: [1, 384],
          data: new Float32Array(384).fill(0.05),
        });
      }
    });

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.embeddingModel') return 'sentence-transformers/all-MiniLM-L6-v2';
        if (key === 'app.embeddingDimensions') return '384';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize local pipeline with Xenova mapping', async () => {
      await service.onModuleInit();
      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    });
  });

  describe('generateEmbedding', () => {
    it('should generate a 384-dimensional embedding for single text', async () => {
      await service.onModuleInit();
      const vector = await service.generateEmbedding('hello world');
      expect(vector).toBeInstanceOf(Array);
      expect(vector.length).toBe(384);
      expect(vector[0]).toBeCloseTo(0.05);
    });

    it('should throw error for empty input text', async () => {
      await service.onModuleInit();
      await expect(service.generateEmbedding('')).rejects.toThrow(
        'Input text for embedding cannot be empty',
      );
      await expect(service.generateEmbedding('   ')).rejects.toThrow(
        'Input text for embedding cannot be empty',
      );
    });

    it('should retry on failure and eventually succeed', async () => {
      await service.onModuleInit();
      let attempts = 0;

      mockExtractor.mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Local ONNX runtime exception');
        }
        return Promise.resolve({
          dims: [1, 384],
          data: new Float32Array(384).fill(0.25),
        });
      });

      const vector = await service.generateEmbedding('test-retry');
      expect(attempts).toBe(2);
      expect(vector.length).toBe(384);
      expect(vector[0]).toBeCloseTo(0.25);
    });

    it('should throw error on dimension mismatch', async () => {
      await service.onModuleInit();
      mockExtractor.mockResolvedValueOnce({
        dims: [1, 128],
        data: new Float32Array(128).fill(0.99),
      });

      await expect(service.generateEmbedding('trigger mismatch')).rejects.toThrow(
        /Dimension mismatch: expected 384, got 128/,
      );
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate multiple 384-dimensional embeddings for batch', async () => {
      await service.onModuleInit();
      const vectors = await service.generateEmbeddings(['sentence one', 'sentence two']);
      expect(vectors).toBeInstanceOf(Array);
      expect(vectors.length).toBe(2);
      expect(vectors[0].length).toBe(384);
      expect(vectors[0][0]).toBeCloseTo(0.15);
      expect(vectors[1].length).toBe(384);
      expect(vectors[1][0]).toBeCloseTo(0.15);
    });

    it('should return empty array for empty batch', async () => {
      await service.onModuleInit();
      const vectors = await service.generateEmbeddings([]);
      expect(vectors).toEqual([]);
    });

    it('should return all-zero arrays for batches with only empty strings', async () => {
      await service.onModuleInit();
      const vectors = await service.generateEmbeddings(['', '  ']);
      expect(vectors.length).toBe(2);
      expect(vectors[0]).toEqual(new Array(384).fill(0));
    });
  });
});
