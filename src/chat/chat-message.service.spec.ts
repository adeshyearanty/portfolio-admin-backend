import { ChatMessageService } from './chat-message.service';
import { ChatMessageRepository } from './repositories/chat-message.repository';
import { ChatRole, MessageStatus } from './enums/chat.enums';

describe('ChatMessageService', () => {
  let service: ChatMessageService;
  let messageRepo: jest.Mocked<ChatMessageRepository>;

  beforeEach(() => {
    messageRepo = {
      create: jest.fn(),
      findBySessionId: jest.fn(),
      updateContent: jest.fn(),
      markStaleStreamingAsFailed: jest.fn(),
      deleteBySessionId: jest.fn(),
      onModuleInit: jest.fn(),
    } as any;

    service = new ChatMessageService(messageRepo);
  });

  describe('saveUserMessage', () => {
    it('should create a user message with COMPLETED status', async () => {
      const mockMsg = {
        id: 'msg-1',
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.USER,
        content: 'Hello',
        status: MessageStatus.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      messageRepo.create.mockResolvedValue(mockMsg);

      const result = await service.saveUserMessage(
        'session-1',
        'visitor-1',
        'Hello',
      );

      expect(messageRepo.create).toHaveBeenCalledWith({
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.USER,
        content: 'Hello',
        status: MessageStatus.COMPLETED,
      });
      expect(result).toEqual(mockMsg);
    });
  });

  describe('createAssistantMessage', () => {
    it('should create an assistant message with STREAMING status and empty content', async () => {
      const mockMsg = {
        id: 'msg-2',
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.ASSISTANT,
        content: '',
        status: MessageStatus.STREAMING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      messageRepo.create.mockResolvedValue(mockMsg);

      const result = await service.createAssistantMessage(
        'session-1',
        'visitor-1',
      );

      expect(messageRepo.create).toHaveBeenCalledWith({
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.ASSISTANT,
        content: '',
        status: MessageStatus.STREAMING,
      });
      expect(result.status).toBe(MessageStatus.STREAMING);
      expect(result.content).toBe('');
    });
  });

  describe('completeMessage', () => {
    it('should update message with final content and COMPLETED status', async () => {
      const mockMsg = {
        id: 'msg-2',
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.ASSISTANT,
        content: 'Hello, I am an AI assistant.',
        status: MessageStatus.COMPLETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      messageRepo.updateContent.mockResolvedValue(mockMsg);

      const result = await service.completeMessage(
        'msg-2',
        'Hello, I am an AI assistant.',
      );

      expect(messageRepo.updateContent).toHaveBeenCalledWith(
        'msg-2',
        'Hello, I am an AI assistant.',
        MessageStatus.COMPLETED,
      );
      expect(result!.status).toBe(MessageStatus.COMPLETED);
    });
  });

  describe('failMessage', () => {
    it('should update message with FAILED status', async () => {
      const mockMsg = {
        id: 'msg-2',
        sessionId: 'session-1',
        visitorId: 'visitor-1',
        role: ChatRole.ASSISTANT,
        content: 'Partial response...',
        status: MessageStatus.FAILED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      messageRepo.updateContent.mockResolvedValue(mockMsg);

      const result = await service.failMessage('msg-2', 'Partial response...');

      expect(messageRepo.updateContent).toHaveBeenCalledWith(
        'msg-2',
        'Partial response...',
        MessageStatus.FAILED,
      );
      expect(result!.status).toBe(MessageStatus.FAILED);
    });
  });

  describe('getSessionMessages', () => {
    it('should return messages limited to 100 by default', async () => {
      messageRepo.findBySessionId.mockResolvedValue([]);

      await service.getSessionMessages('session-1');

      expect(messageRepo.findBySessionId).toHaveBeenCalledWith(
        'session-1',
        100,
      );
    });
  });
});
