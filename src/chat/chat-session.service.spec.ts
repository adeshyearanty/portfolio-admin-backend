import { ChatSessionService } from './chat-session.service';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatMessageRepository } from './repositories/chat-message.repository';
import { ChatChannel } from './enums/chat.enums';
import { MessageStatus } from './enums/chat.enums';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ChatSessionService', () => {
  let service: ChatSessionService;
  let sessionRepo: jest.Mocked<ChatSessionRepository>;
  let messageRepo: jest.Mocked<ChatMessageRepository>;

  beforeEach(() => {
    sessionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByVisitorIdAndChannel: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      onModuleInit: jest.fn(),
    } as any;

    messageRepo = {
      create: jest.fn(),
      findBySessionId: jest.fn(),
      updateContent: jest.fn(),
      markStaleStreamingAsFailed: jest.fn(),
      deleteBySessionId: jest.fn(),
      onModuleInit: jest.fn(),
    } as any;

    service = new ChatSessionService(sessionRepo, messageRepo);
  });

  describe('createSession', () => {
    it('should create a session with default title', async () => {
      const mockSession = {
        id: 'session-1',
        visitorId: 'visitor-1',
        title: 'New conversation',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      };
      sessionRepo.create.mockResolvedValue(mockSession);

      const result = await service.createSession('visitor-1', ChatChannel.WEB);

      expect(sessionRepo.create).toHaveBeenCalledWith({
        visitorId: 'visitor-1',
        title: 'New conversation',
        channel: ChatChannel.WEB,
      });
      expect(result).toEqual(mockSession);
    });
  });

  describe('getSessions', () => {
    it('should return sessions with message counts', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          visitorId: 'visitor-1',
          title: 'First conversation',
          channel: ChatChannel.WEB,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: 5,
        },
      ];
      sessionRepo.findByVisitorIdAndChannel.mockResolvedValue(mockSessions);

      const result = await service.getSessions('visitor-1', ChatChannel.WEB);

      expect(sessionRepo.findByVisitorIdAndChannel).toHaveBeenCalledWith(
        'visitor-1',
        ChatChannel.WEB,
      );
      expect(result).toEqual(mockSessions);
      expect(result[0].messageCount).toBe(5);
    });
  });

  describe('getConversation', () => {
    it('should return session and messages for valid owner', async () => {
      const mockSession = {
        id: 'session-1',
        visitorId: 'visitor-1',
        title: 'Test',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      };
      sessionRepo.findById.mockResolvedValue(mockSession);
      messageRepo.markStaleStreamingAsFailed.mockResolvedValue(0);
      messageRepo.findBySessionId.mockResolvedValue([]);

      const result = await service.getConversation('session-1', 'visitor-1');

      expect(result.session).toEqual(mockSession);
      expect(result.messages).toEqual([]);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      await expect(
        service.getConversation('invalid', 'visitor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when visitor does not own session', async () => {
      sessionRepo.findById.mockResolvedValue({
        id: 'session-1',
        visitorId: 'other-visitor',
        title: 'Test',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      });

      await expect(
        service.getConversation('session-1', 'visitor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should mark stale streaming messages as failed', async () => {
      sessionRepo.findById.mockResolvedValue({
        id: 'session-1',
        visitorId: 'visitor-1',
        title: 'Test',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      });
      messageRepo.markStaleStreamingAsFailed.mockResolvedValue(2);
      messageRepo.findBySessionId.mockResolvedValue([]);

      await service.getConversation('session-1', 'visitor-1');

      expect(messageRepo.markStaleStreamingAsFailed).toHaveBeenCalledWith(
        'session-1',
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete session and associated messages', async () => {
      sessionRepo.findById.mockResolvedValue({
        id: 'session-1',
        visitorId: 'visitor-1',
        title: 'Test',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      });
      messageRepo.deleteBySessionId.mockResolvedValue(5);
      sessionRepo.delete.mockResolvedValue(true);

      await service.deleteSession('session-1', 'visitor-1');

      expect(messageRepo.deleteBySessionId).toHaveBeenCalledWith('session-1');
      expect(sessionRepo.delete).toHaveBeenCalledWith('session-1');
    });

    it('should throw ForbiddenException for wrong visitor', async () => {
      sessionRepo.findById.mockResolvedValue({
        id: 'session-1',
        visitorId: 'other-visitor',
        title: 'Test',
        channel: ChatChannel.WEB,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: null,
      });

      await expect(
        service.deleteSession('session-1', 'visitor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteSession('invalid', 'visitor-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSessionTitle', () => {
    it('should generate title from short message', async () => {
      sessionRepo.update.mockResolvedValue(null);
      await service.updateSessionTitle('session-1', 'Hello there');

      expect(sessionRepo.update).toHaveBeenCalledWith('session-1', {
        title: 'Hello there',
      });
    });

    it('should truncate long messages at word boundary', async () => {
      const longMessage =
        'What projects have you worked on and what technologies did you use for building them?';
      sessionRepo.update.mockResolvedValue(null);
      await service.updateSessionTitle('session-1', longMessage);

      const call = sessionRepo.update.mock.calls[0];
      expect(call[1].title!.length).toBeLessThanOrEqual(53); // 50 + "..."
      expect(call[1].title!.endsWith('...')).toBe(true);
    });
  });
});
