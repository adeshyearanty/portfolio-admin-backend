import { Test, TestingModule } from '@nestjs/testing';
import { ChatMemoryService } from './chat-memory.service';

describe('ChatMemoryService', () => {
  let service: ChatMemoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatMemoryService],
    }).compile();

    service = module.get<ChatMemoryService>(ChatMemoryService);
  });

  afterEach(() => {
    service.onModuleDestroy(); // clean up interval timers
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveMessage and getHistory', () => {
    it('should save and retrieve history correctly', () => {
      service.saveMessage('session-1', 'user', 'Hello');
      service.saveMessage('session-1', 'assistant', 'Hi');

      const history = service.getHistory('session-1');
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', text: 'Hello' });
      expect(history[1]).toEqual({ role: 'assistant', text: 'Hi' });
    });

    it('should cap history to the last 10 messages', () => {
      for (let i = 1; i <= 12; i++) {
        service.saveMessage(
          'session-2',
          i % 2 === 1 ? 'user' : 'assistant',
          `Message ${i}`,
        );
      }

      const history = service.getHistory('session-2');
      expect(history).toHaveLength(10);
      expect(history[0].text).toBe('Message 3');
      expect(history[9].text).toBe('Message 12');
    });

    it('should return empty history if session does not exist', () => {
      expect(service.getHistory('non-existing')).toEqual([]);
    });

    it('should evict history if session has expired after 30 minutes', () => {
      const nowSpy = jest.spyOn(Date, 'now');

      // 1. Initial save at time T0
      const t0 = 1700000000000;
      nowSpy.mockReturnValue(t0);
      service.saveMessage('session-3', 'user', 'Hello');

      // 2. Access within 30 minutes (T0 + 15 min) - should refresh TTL
      const t1 = t0 + 15 * 60 * 1000;
      nowSpy.mockReturnValue(t1);
      const historyActive = service.getHistory('session-3');
      expect(historyActive).toHaveLength(1);

      // 3. Access after another 31 minutes (T1 + 31 min) - should evict
      const t2 = t1 + 31 * 60 * 1000;
      nowSpy.mockReturnValue(t2);
      const historyExpired = service.getHistory('session-3');
      expect(historyExpired).toEqual([]);

      nowSpy.mockRestore();
    });
  });
});
