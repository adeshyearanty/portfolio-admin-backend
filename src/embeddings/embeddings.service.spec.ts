import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingsService } from './embeddings.service';
import { ConfigService } from '@nestjs/config';

// Mock @google/genai module
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          embedContent: jest
            .fn()
            .mockImplementation((args: { contents: string | string[] }) => {
              const isBatch = Array.isArray(args.contents);
              if (isBatch) {
                const contentsArray = args.contents as string[];
                return Promise.resolve({
                  embeddings: contentsArray.map(() => ({
                    values: new Array(768).fill(0.2),
                  })),
                });
              } else {
                return Promise.resolve({
                  embeddings: [
                    {
                      values: new Array(768).fill(0.1),
                    },
                  ],
                });
              }
            }),
        },
      };
    }),
  };
});

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.googleApiKey') return 'mock-key';
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

  describe('constructor', () => {
    it('should throw error if apiKey is not provided', () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);
      const oldEnv = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      expect(() => new EmbeddingsService(configService)).toThrow(
        'GOOGLE_API_KEY is not defined in environment configurations',
      );

      process.env.GOOGLE_API_KEY = oldEnv;
    });
  });

  describe('generateEmbedding', () => {
    it('should return a single embedding vector', async () => {
      const vector = await service.generateEmbedding('hello world');
      expect(vector).toBeInstanceOf(Array);
      expect(vector.length).toBe(768);
      expect(vector[0]).toBe(0.1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const embedContentMock = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Transient error');
        }
        return Promise.resolve({
          embeddings: [{ values: [0.5, 0.6] }],
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (service as any).ai.models.embedContent = embedContentMock;

      const vector = await service.generateEmbedding('test-retry');
      expect(attempts).toBe(2);
      expect(vector).toEqual([0.5, 0.6]);
    });
  });

  describe('generateEmbeddings', () => {
    it('should return multiple embedding vectors for batch', async () => {
      const vectors = await service.generateEmbeddings(['hello', 'world']);
      expect(vectors).toBeInstanceOf(Array);
      expect(vectors.length).toBe(2);
      expect(vectors[0].length).toBe(768);
      expect(vectors[0][0]).toBe(0.1);
    });

    it('should return empty array for empty batch', async () => {
      const vectors = await service.generateEmbeddings([]);
      expect(vectors).toEqual([]);
    });
  });
});
