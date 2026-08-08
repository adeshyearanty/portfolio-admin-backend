import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { ChatService } from './chat.service';

describe('WhatsappWebhookController', () => {
  let controller: WhatsappWebhookController;
  let chatService: ChatService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'app.whatsappVerifyToken') return 'verify-token-123';
      if (key === 'app.whatsappPhoneNumberId') return 'phone-id-123';
      if (key === 'app.whatsappAccessToken') return 'access-token-123';
      return null;
    }),
  };

  const mockChatService = {
    handleUserMessage: jest.fn(),
  };

  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<WhatsappWebhookController>(
      WhatsappWebhookController,
    );
    chatService = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('should return challenge if verify token matches', () => {
      const result = controller.verifyWebhook(
        'subscribe',
        'my-challenge',
        'verify-token-123',
      );
      expect(result).toBe('my-challenge');
    });

    it('should throw Forbidden exception if token mismatches', () => {
      expect(() =>
        controller.verifyWebhook(
          'subscribe',
          'my-challenge',
          'incorrect-token',
        ),
      ).toThrow(new HttpException('Forbidden', HttpStatus.FORBIDDEN));
    });
  });

  describe('receiveMessage', () => {
    it('should return EVENT_RECEIVED and ignore non-whatsapp objects', async () => {
      const result = await controller.receiveMessage({ object: 'other' });
      expect(result).toBe('EVENT_RECEIVED');
      expect(mockChatService.handleUserMessage).not.toHaveBeenCalled();
    });

    it('should return EVENT_RECEIVED and ignore status-only changes', async () => {
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: 'status-1' }],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };
      const result = await controller.receiveMessage(body);
      expect(result).toBe('EVENT_RECEIVED');
      expect(mockChatService.handleUserMessage).not.toHaveBeenCalled();
    });

    it('should process text messages, de-duplicate, call ChatService, and dispatch fetch reply', async () => {
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'msg-abc-123',
                      from: '1234567890',
                      type: 'text',
                      text: {
                        body: 'Hello AI',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const mockChatResponse = {
        answer: 'This is my AI response',
        sources: [],
      };
      const handleUserMessageMock = jest
        .spyOn(chatService, 'handleUserMessage')
        .mockResolvedValue(mockChatResponse);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => {
          await Promise.resolve();
          return 'success';
        },
      });
      global.fetch = mockFetch;

      // 1. Process first incoming message
      const result1 = await controller.receiveMessage(body);
      expect(result1).toBe('EVENT_RECEIVED');

      expect(handleUserMessageMock).toHaveBeenCalledWith(
        'Hello AI',
        '1234567890',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v20.0/phone-id-123/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer access-token-123',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '1234567890',
            type: 'text',
            text: {
              preview_url: false,
              body: 'This is my AI response',
            },
          }),
        },
      );

      // 2. Process duplicate message ID - should bypass ChatService and fetch
      handleUserMessageMock.mockClear();
      mockFetch.mockClear();

      const result2 = await controller.receiveMessage(body);
      expect(result2).toBe('EVENT_RECEIVED');
      expect(handleUserMessageMock).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
