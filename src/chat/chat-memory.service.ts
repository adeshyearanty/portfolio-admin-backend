import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface SessionData {
  messages: ChatMessage[];
  lastAccessed: number;
}

@Injectable()
export class ChatMemoryService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatMemoryService.name);
  private readonly cache = new Map<string, SessionData>();
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes in ms
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup sweep every 5 minutes to release expired memory
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  getHistory(sessionId: string): ChatMessage[] {
    const session = this.cache.get(sessionId);
    if (!session) {
      return [];
    }

    const now = Date.now();
    if (now - session.lastAccessed > this.ttlMs) {
      this.logger.log(
        `Session ${sessionId} has expired. Evicting from memory.`,
      );
      this.cache.delete(sessionId);
      return [];
    }

    // Refresh last accessed time on read access
    session.lastAccessed = now;
    return session.messages;
  }

  saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
  ): void {
    const now = Date.now();
    let session = this.cache.get(sessionId);

    if (!session) {
      session = {
        messages: [],
        lastAccessed: now,
      };
      this.cache.set(sessionId, session);
    }

    session.messages.push({ role, text });
    session.lastAccessed = now;

    // Retain only the last 10 messages
    if (session.messages.length > 10) {
      session.messages = session.messages.slice(-10);
    }
  }

  clearHistory(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  private cleanup(): void {
    const now = Date.now();
    let evictedCount = 0;

    for (const [sessionId, session] of this.cache.entries()) {
      if (now - session.lastAccessed > this.ttlMs) {
        this.cache.delete(sessionId);
        evictedCount++;
      }
    }

    if (evictedCount > 0) {
      this.logger.log(`Evicted ${evictedCount} expired chat memory sessions.`);
    }
  }
}
