import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

const mockCompletionsCreate = jest.fn();

jest.mock('groq-sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCompletionsCreate,
        },
      },
    })),
    Groq: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCompletionsCreate,
        },
      },
    })),
  };
});

describe('LlmService', () => {
  let service: LlmService;
  let configService: ConfigService;

  const defaultMockConfig = (key: string) => {
    if (key === 'app.groqApiKey') return 'gsk_mock_secret_key_12345';
    if (key === 'app.llmModel') return 'openai/gpt-oss-120b';
    return null;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn().mockImplementation(defaultMockConfig),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should throw error if apiKey is not provided in config or env', () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);
      const oldEnv = process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY;

      expect(() => new LlmService(configService)).toThrow(
        'GROQ_API_KEY is not defined in environment configurations',
      );

      process.env.GROQ_API_KEY = oldEnv;
    });

    it('should use default model openai/gpt-oss-120b if not specified', () => {
      const customConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'app.groqApiKey') return 'gsk_test_key';
          return null;
        }),
      } as unknown as ConfigService;

      const customService = new LlmService(customConfigService);
      expect(customService).toBeDefined();
      expect((customService as any).modelName).toBe('openai/gpt-oss-120b');
    });

    it('should use custom model if configured', () => {
      const customConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'app.groqApiKey') return 'gsk_test_key';
          if (key === 'app.llmModel') return 'llama-3.3-70b-versatile';
          return null;
        }),
      } as unknown as ConfigService;

      const customService = new LlmService(customConfigService);
      expect((customService as any).modelName).toBe('llama-3.3-70b-versatile');
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
      mockCompletionsCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'Adesh is a software architect with expertise in **Node.js**.',
            },
          },
        ],
      });

      const answer = await service.generateAnswer(
        'Who is Adesh?',
        'Context about Adesh',
        'web',
      );

      expect(answer).toBe('Adesh is a software architect with expertise in **Node.js**.');
      expect(mockCompletionsCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('WEB MARKDOWN FORMATTING RULES:'),
          },
          {
            role: 'user',
            content: expect.stringContaining('Who is Adesh?'),
          },
        ],
        stream: false,
      });
    });

    it('should return a non-streaming string answer for whatsapp channel', async () => {
      mockCompletionsCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'Adesh is a software architect with expertise in *Node.js*.',
            },
          },
        ],
      });

      const answer = await service.generateAnswer(
        'Who is Adesh?',
        'Context about Adesh',
        'whatsapp',
      );

      expect(answer).toBe('Adesh is a software architect with expertise in *Node.js*.');
      expect(mockCompletionsCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('WHATSAPP FORMATTING RULES:'),
          },
          {
            role: 'user',
            content: expect.stringContaining('Who is Adesh?'),
          },
        ],
        stream: false,
      });
    });

    it('should respect custom systemInstruction if provided', async () => {
      mockCompletionsCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'Custom instruction reply',
            },
          },
        ],
      });

      const answer = await service.generateAnswer(
        'Hello',
        'Context',
        'web',
        'You are a custom assistant.',
      );

      expect(answer).toBe('Custom instruction reply');
      expect(mockCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: 'You are a custom assistant.',
            },
            expect.any(Object),
          ],
        }),
      );
    });

    it('should throw error when LLM provider returns empty response text', async () => {
      mockCompletionsCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
            },
          },
        ],
      });

      await expect(
        service.generateAnswer('Who is Adesh?', 'Context'),
      ).rejects.toThrow('LLM provider returned empty response text');
    });

    it('should throw error when LLM provider choices array is empty', async () => {
      mockCompletionsCreate.mockResolvedValueOnce({
        choices: [],
      });

      await expect(
        service.generateAnswer('Who is Adesh?', 'Context'),
      ).rejects.toThrow('LLM provider returned empty response text');
    });
  });

  describe('generateAnswerStream', () => {
    it('should progressively yield text chunks from stream', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'Adesh ' } }] },
        { choices: [{ delta: { content: 'is ' } }] },
        { choices: [{ delta: { content: 'a ' } }] },
        { choices: [{ delta: { content: 'lead ' } }] },
        { choices: [{ delta: { content: 'engineer.' } }] },
      ];

      const asyncIterableStream = (async function* () {
        for (const chunk of mockChunks) {
          await Promise.resolve();
          yield chunk;
        }
      })();

      mockCompletionsCreate.mockResolvedValueOnce(asyncIterableStream);

      const generator = service.generateAnswerStream(
        'Who is Adesh?',
        'Context',
        'web',
      );

      const collectedChunks: string[] = [];
      for await (const chunk of generator) {
        collectedChunks.push(chunk);
      }

      expect(collectedChunks).toEqual([
        'Adesh ',
        'is ',
        'a ',
        'lead ',
        'engineer.',
      ]);

      expect(mockCompletionsCreate).toHaveBeenCalledWith({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('WEB MARKDOWN FORMATTING RULES:'),
          },
          {
            role: 'user',
            content: expect.stringContaining('Who is Adesh?'),
          },
        ],
        stream: true,
      });
    });

    it('should handle chunks without delta content safely', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: {} }] },
        { choices: [] },
        { choices: [{ delta: { content: ' World' } }] },
      ];

      const asyncIterableStream = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      mockCompletionsCreate.mockResolvedValueOnce(asyncIterableStream);

      const generator = service.generateAnswerStream('Hi', 'Context');
      const collected: string[] = [];
      for await (const chunk of generator) {
        collected.push(chunk);
      }

      expect(collected).toEqual(['Hello', ' World']);
    });
  });

  describe('Error handling & Retry logic', () => {
    it('should fast-fail on 401 Unauthorized without retrying', async () => {
      const error401 = {
        status: 401,
        message: 'Incorrect API key provided: gsk_mock_secret_key_12345',
      };
      mockCompletionsCreate.mockRejectedValue(error401);

      await expect(
        service.generateAnswer('Who is Adesh?', 'Context'),
      ).rejects.toThrow(/LLM provider authentication failed/);

      // Should only be called once because 401 is not retryable
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    });

    it('should fast-fail on 403 Forbidden without retrying', async () => {
      const error403 = {
        status: 403,
        message: 'Model access forbidden for your account',
      };
      mockCompletionsCreate.mockRejectedValue(error403);

      await expect(
        service.generateAnswer('Who is Adesh?', 'Context'),
      ).rejects.toThrow(/LLM provider access forbidden/);

      expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    });

    it('should fast-fail on 400 Bad Request without retrying', async () => {
      const error400 = {
        status: 400,
        message: 'Invalid parameter model: unknown-model',
      };
      mockCompletionsCreate.mockRejectedValue(error400);

      await expect(
        service.generateAnswer('Who is Adesh?', 'Context'),
      ).rejects.toThrow(/LLM provider bad request/);

      expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 Rate Limit error and succeed on subsequent retry', async () => {
      const error429 = {
        status: 429,
        message: 'Rate limit reached for requests per minute',
      };

      mockCompletionsCreate
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Success on retry' } }],
        });

      const answer = await service.generateAnswer('Hello', 'Context');
      expect(answer).toBe('Success on retry');
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 Provider Internal Server Error and succeed on subsequent retry', async () => {
      const error500 = {
        status: 500,
        message: 'Internal server error from Groq',
      };

      mockCompletionsCreate
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Recovered after 500' } }],
        });

      const answer = await service.generateAnswer('Hello', 'Context');
      expect(answer).toBe('Recovered after 500');
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry before stream begins and yield chunks when subsequent attempt succeeds', async () => {
      const error503 = {
        status: 503,
        message: 'Service unavailable',
      };

      const mockChunks = [
        { choices: [{ delta: { content: 'Stream chunk after retry' } }] },
      ];
      const asyncIterableStream = (async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      })();

      mockCompletionsCreate
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce(asyncIterableStream);

      const generator = service.generateAnswerStream('Hello', 'Context');
      const chunks: string[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Stream chunk after retry']);
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(2);
    });

    it('should not retry after streaming begins if an error occurs mid-stream', async () => {
      const failingStream = (async function* () {
        yield { choices: [{ delta: { content: 'First chunk ' } }] };
        throw new Error('Connection severed mid-stream');
      })();

      mockCompletionsCreate.mockResolvedValue(failingStream);

      const generator = service.generateAnswerStream('Hello', 'Context');

      const received: string[] = [];
      await expect(async () => {
        for await (const chunk of generator) {
          received.push(chunk);
        }
      }).rejects.toThrow('Connection severed mid-stream');

      // The first chunk was yielded before the error
      expect(received).toEqual(['First chunk ']);
      // Should NOT have triggered a retry (mockCompletionsCreate called only once)
      expect(mockCompletionsCreate).toHaveBeenCalledTimes(1);
    });

    it('should never expose GROQ_API_KEY in error messages or logs', async () => {
      const rawSecret = 'gsk_mock_secret_key_12345';
      const errorWithSecret = {
        status: 401,
        message: `Failed request to Groq with key ${rawSecret}`,
      };

      mockCompletionsCreate.mockRejectedValue(errorWithSecret);

      try {
        await service.generateAnswer('Who are you?', 'Context');
        fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).not.toContain(rawSecret);
        expect(err.message).toContain('[REDACTED_API_KEY]');
      }
    });
  });
});
