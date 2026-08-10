import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { LlmService } from '../llm/llm.service';
import { RetrievalService } from '../knowledge-base/retrieval.service';
import { ChatMemoryService } from './chat-memory.service';
import { ChatMessageService } from './chat-message.service';
import { ChatSessionService } from './chat-session.service';
import { WhatsAppMessageFormatter } from './whatsapp-message-formatter.service';

describe('ChatService', () => {
  let service: ChatService;
  let chatMemoryService: ChatMemoryService;

  const mockRetrievalService = {
    retrieve: jest.fn(),
  };

  const mockLlmService = {
    generateAnswer: jest.fn(),
    generateAnswerStream: jest.fn(),
  };

  const mockChatMessageService = {
    saveUserMessage: jest.fn(),
    createAssistantMessage: jest.fn(),
    completeMessage: jest.fn(),
    failMessage: jest.fn(),
    getSessionMessages: jest.fn(),
  };

  const mockChatSessionService = {
    validateSessionOwnership: jest.fn(),
    updateSessionTitle: jest.fn(),
    updateLastMessageAt: jest.fn(),
  };

  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        ChatService,
        ChatMemoryService,
        WhatsAppMessageFormatter,
        {
          provide: RetrievalService,
          useValue: mockRetrievalService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: ChatMessageService,
          useValue: mockChatMessageService,
        },
        {
          provide: ChatSessionService,
          useValue: mockChatSessionService,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatMemoryService = module.get<ChatMemoryService>(ChatMemoryService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleUserMessage', () => {
    it('should retrieve context, generate answer, and return sources for web channel', async () => {
      const mockMessage = 'Tell me about Adesh';
      const mockChunks = [
        {
          chunk: 'Adesh is a software architect.',
          score: 0.9,
          metadata: {
            documentId: 'doc-1',
            filename: 'profile.txt',
            chunkIndex: 0,
          },
        },
      ];

      mockRetrievalService.retrieve.mockResolvedValue(mockChunks);
      mockLlmService.generateAnswer.mockResolvedValue(
        'Adesh is a software architect with expertise in **Node.js**.',
      );

      const result = await service.handleUserMessage(mockMessage);

      // Verify retrieval query
      expect(mockRetrievalService.retrieve).toHaveBeenCalledWith(mockMessage);

      // Verify LLM parameters
      expect(mockLlmService.generateAnswer).toHaveBeenCalledWith(
        mockMessage,
        expect.stringContaining(
          '[Source 1 - profile.txt]:\nAdesh is a software architect.',
        ),
        'web',
      );

      // Assert final response shape
      expect(result).toEqual({
        answer: 'Adesh is a software architect with expertise in **Node.js**.',
        sources: [
          {
            documentId: 'doc-1',
            filename: 'profile.txt',
            chunkIndex: 0,
          },
        ],
      });
    });

    it('should apply WhatsApp formatting when channel is whatsapp', async () => {
      const mockMessage = 'What tech does Adesh know?';
      const mockChunks = [
        {
          chunk: 'Frontend: React, Next.js. Backend: NestJS.',
          score: 0.85,
          metadata: {
            documentId: 'doc-1',
            filename: 'skills.txt',
            chunkIndex: 0,
          },
        },
      ];

      mockRetrievalService.retrieve.mockResolvedValue(mockChunks);
      mockLlmService.generateAnswer.mockResolvedValue(
        '* **Frontend:** React, Next.js\n* **Backend:** NestJS and **Node.js**',
      );

      const result = await service.handleUserMessage(
        mockMessage,
        'user-123',
        'whatsapp',
      );

      expect(mockLlmService.generateAnswer).toHaveBeenCalledWith(
        mockMessage,
        expect.any(String),
        'whatsapp',
      );

      expect(result.answer).toContain('• *Frontend:* React, Next.js');
      expect(result.answer).toContain('• *Backend:* NestJS and *Node.js*');
      expect(result.answer).not.toContain('**');
    });

    it('should retrieve from and save to conversation memory when sessionId is provided', async () => {
      const mockMessage = 'Tell me about Adesh';
      const mockChunks = [
        {
          chunk: 'Adesh is a software architect.',
          score: 0.9,
          metadata: {
            documentId: 'doc-1',
            filename: 'profile.txt',
            chunkIndex: 0,
          },
        },
      ];

      mockRetrievalService.retrieve.mockResolvedValue(mockChunks);
      mockLlmService.generateAnswer.mockResolvedValue(
        'Adesh is a software architect.',
      );

      // Seed mock memory history
      const getHistorySpy = jest
        .spyOn(chatMemoryService, 'getHistory')
        .mockReturnValue([
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'Hi, how can I help?' },
        ]);
      const saveMessageSpy = jest.spyOn(chatMemoryService, 'saveMessage');

      const result = await service.handleUserMessage(
        mockMessage,
        'session-123',
      );

      // Verify history query
      expect(getHistorySpy).toHaveBeenCalledWith('session-123');

      // Verify LLM parameters contain history text
      expect(mockLlmService.generateAnswer).toHaveBeenCalledWith(
        mockMessage,
        expect.stringContaining(
          'Conversation History:\nUser: Hello\nAssistant: Hi, how can I help?',
        ),
        'web',
      );

      // Verify both messages saved to memory
      expect(saveMessageSpy).toHaveBeenCalledTimes(2);
      expect(saveMessageSpy).toHaveBeenNthCalledWith(
        1,
        'session-123',
        'user',
        mockMessage,
      );
      expect(saveMessageSpy).toHaveBeenNthCalledWith(
        2,
        'session-123',
        'assistant',
        'Adesh is a software architect.',
      );

      expect(result.answer).toBe('Adesh is a software architect.');
    });

    it('should invoke LLM and return empty sources when no chunks retrieved', async () => {
      const mockMessage = 'What is his favorite color?';
      mockRetrievalService.retrieve.mockResolvedValue([]);
      mockLlmService.generateAnswer.mockResolvedValue(
        "I don't have enough information about that in my portfolio details yet.",
      );

      const result = await service.handleUserMessage(mockMessage);

      expect(mockRetrievalService.retrieve).toHaveBeenCalledWith(mockMessage);
      expect(mockLlmService.generateAnswer).toHaveBeenCalledWith(
        mockMessage,
        '',
        'web',
      );

      expect(result).toEqual({
        answer: "I don't have enough information about that in my portfolio details yet.",
        sources: [],
      });
    });
  });
});
