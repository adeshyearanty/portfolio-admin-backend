import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from './gemini.service';
import { ConfigService } from '@nestjs/config';

// Mock @google/genai module
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: 'Mocked Gemini answer text',
          }),
          generateContentStream: jest.fn().mockImplementation(() => {
            const mockChunks = [
              { text: 'Mocked ' },
              { text: 'Gemini ' },
              { text: 'streamed ' },
              { text: 'answer ' },
              { text: 'text' },
            ];
            return (async function* () {
              for (const chunk of mockChunks) {
                await Promise.resolve();
                yield chunk;
              }
            })();
          }),
        },
      };
    }),
  };
});

describe('GeminiService', () => {
  let service: GeminiService;
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
        GeminiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
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

      expect(() => new GeminiService(configService)).toThrow(
        'GOOGLE_API_KEY is not defined in environment configurations',
      );

      process.env.GOOGLE_API_KEY = oldEnv;
    });
  });

  describe('getSystemInstruction', () => {
    it('should return WhatsApp-specific formatting instructions when channel is whatsapp', () => {
      const instruction = service.getSystemInstruction('whatsapp');
      expect(instruction).toContain('WHATSAPP FORMATTING RULES:');
      expect(instruction).toContain('*single asterisks*');
      expect(instruction).not.toContain('WEB MARKDOWN FORMATTING RULES:');
    });

    it('should return Web Markdown formatting instructions when channel is web', () => {
      const instruction = service.getSystemInstruction('web');
      expect(instruction).toContain('WEB MARKDOWN FORMATTING RULES:');
      expect(instruction).toContain('**text**');
    });
  });

  describe('generateAnswer', () => {
    it('should return a non-streaming string answer for web channel', async () => {
      const answer = await service.generateAnswer(
        'Who are you?',
        'Context info',
        'web',
      );
      expect(answer).toBe('Mocked Gemini answer text');
    });

    it('should return a non-streaming string answer for whatsapp channel', async () => {
      const answer = await service.generateAnswer(
        'Who are you?',
        'Context info',
        'whatsapp',
      );
      expect(answer).toBe('Mocked Gemini answer text');
    });
  });

  describe('generateAnswerStream', () => {
    it('should yield text chunks from stream', async () => {
      const generator = service.generateAnswerStream(
        'Who are you?',
        'Context info',
      );
      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([
        'Mocked ',
        'Gemini ',
        'streamed ',
        'answer ',
        'text',
      ]);
    });
  });
});
