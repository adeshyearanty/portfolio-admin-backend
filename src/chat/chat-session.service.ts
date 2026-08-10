import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ChatSessionRepository,
  ChatSessionEntity,
  ChatSessionWithCount,
} from './repositories/chat-session.repository';
import { ChatMessageRepository } from './repositories/chat-message.repository';
import { ChatChannel } from './enums/chat.enums';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly messageRepository: ChatMessageRepository,
  ) {}

  async createSession(
    visitorId: string,
    channel: ChatChannel,
  ): Promise<ChatSessionEntity> {
    const session = await this.sessionRepository.create({
      visitorId,
      title: 'New conversation',
      channel,
    });

    this.logger.log(
      `Created session ${session.id} for visitor ${visitorId} [${channel}]`,
    );
    return session;
  }

  async getSessions(
    visitorId: string,
    channel: ChatChannel,
  ): Promise<ChatSessionWithCount[]> {
    return this.sessionRepository.findByVisitorIdAndChannel(
      visitorId,
      channel,
    );
  }

  async getConversation(
    sessionId: string,
    visitorId: string,
  ): Promise<{
    session: ChatSessionEntity;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      status: string;
      createdAt: Date;
    }>;
  }> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    // Mark stale streaming messages as failed
    const staleCount =
      await this.messageRepository.markStaleStreamingAsFailed(sessionId);
    if (staleCount > 0) {
      this.logger.warn(
        `Marked ${staleCount} stale streaming messages as FAILED in session ${sessionId}`,
      );
    }

    const messages = await this.messageRepository.findBySessionId(sessionId);

    return {
      session,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        createdAt: m.createdAt,
      })),
    };
  }

  async deleteSession(sessionId: string, visitorId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    const deletedMessages =
      await this.messageRepository.deleteBySessionId(sessionId);
    await this.sessionRepository.delete(sessionId);

    this.logger.log(
      `Deleted session ${sessionId} and ${deletedMessages} associated messages`,
    );
  }

  async validateSessionOwnership(
    sessionId: string,
    visitorId: string,
  ): Promise<ChatSessionEntity> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.visitorId !== visitorId) {
      throw new ForbiddenException('Access denied');
    }

    return session;
  }

  async updateSessionTitle(
    sessionId: string,
    firstMessage: string,
  ): Promise<void> {
    const title = this.generateTitle(firstMessage);
    await this.sessionRepository.update(sessionId, { title });
  }

  async updateLastMessageAt(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastMessageAt: new Date(),
    });
  }

  private generateTitle(message: string): string {
    const raw = message.replace(/\s+/g, ' ').trim();
    const lower = raw.toLowerCase().replace(/[?!.,;:]+$/, '');

    // 1. Semantic topic-based match for prominent portfolio categories
    if (/^(hi|hello|hey|greetings|who are you|tell me about yourself)/i.test(lower)) {
      return 'Introduction & Overview';
    }
    if (lower.includes('salesastra') && (lower.includes('arch') || lower.includes('system') || lower.includes('design'))) {
      return 'SalesAstra Architecture';
    }
    if (lower.includes('salesastra')) {
      return 'SalesAstra Overview';
    }
    if (
      lower.includes('aws') ||
      lower.includes('cloud') ||
      lower.includes('kinesis') ||
      lower.includes('terraform') ||
      lower.includes('lambda') ||
      lower.includes('infrastructure')
    ) {
      if (lower.includes('kinesis') || lower.includes('sqs') || lower.includes('messaging')) {
        return 'AWS Messaging & Streaming';
      }
      return 'AWS & Cloud Architecture';
    }
    if (
      lower.includes('stack') ||
      lower.includes('technolog') ||
      lower.includes('framework') ||
      lower.includes('languages') ||
      lower.includes('skills') ||
      lower.includes('nestjs') ||
      lower.includes('nextjs')
    ) {
      return 'Technical Skills & Stack';
    }
    if (
      lower.includes('experience') ||
      lower.includes('career') ||
      lower.includes('role') ||
      lower.includes('work history') ||
      lower.includes('company') ||
      lower.includes('miraki')
    ) {
      return 'Professional Experience';
    }
    if (
      lower.includes('education') ||
      lower.includes('college') ||
      lower.includes('cbit') ||
      lower.includes('degree') ||
      lower.includes('university')
    ) {
      return 'Education & Background';
    }
    if (
      lower.includes('contact') ||
      lower.includes('hire') ||
      lower.includes('email') ||
      lower.includes('phone') ||
      lower.includes('reach') ||
      lower.includes('touch') ||
      lower.includes('connect')
    ) {
      return 'Contact & Collaboration';
    }
    if (
      lower.includes('project') ||
      lower.includes('portfolio') ||
      lower.includes('built') ||
      lower.includes('case study')
    ) {
      return 'Projects & Engineering';
    }

    // 2. Fallback: Strip conversational filler and format as a concise title
    let cleaned = raw
      .replace(/^[?!.,:;]+|[?!.,:;]+$/g, '')
      .replace(
        /^(can you (please )?(tell me (about)?|explain|describe)|could you (please )?(tell me (about)?|explain)|tell me (about)?|what (is|are|do you know about)|how (do|does|can)|i want to know (about)?|please (tell me|explain|describe)|give me (a )?(summary|details|info) (of|on|about)|do you know (about)?)\s+/i,
        '',
      )
      .replace(/^(the|a|an)\s+/i, '')
      .trim();

    // Capitalize the first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    if (cleaned.length <= 40) {
      return cleaned;
    }

    const truncated = cleaned.substring(0, 40);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }
}
