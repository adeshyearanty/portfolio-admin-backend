import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

interface SendMessagePayload {
  sessionId: string;
  visitorId: string;
  message: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Rate limiting: track last message timestamp per visitor
  private readonly lastMessageTime = new Map<string, number>();
  private readonly RATE_LIMIT_MS = 2000; // 2 seconds
  private readonly MAX_MESSAGE_LENGTH = 2000;

  constructor(private readonly chatService: ChatService) { }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<void> {
    const { sessionId, visitorId, message } = payload;

    // Validate required fields
    if (!sessionId || !visitorId || !message) {
      client.emit('message:error', {
        messageId: null,
        sessionId: sessionId || null,
        error: 'Missing required fields: sessionId, visitorId, message',
      });
      return;
    }

    // Validate message length
    if (message.length > this.MAX_MESSAGE_LENGTH) {
      client.emit('message:error', {
        messageId: null,
        sessionId,
        error: `Message too long. Maximum ${this.MAX_MESSAGE_LENGTH} characters.`,
      });
      return;
    }

    // Rate limiting
    const now = Date.now();
    const lastTime = this.lastMessageTime.get(visitorId) || 0;
    if (now - lastTime < this.RATE_LIMIT_MS) {
      client.emit('message:error', {
        messageId: null,
        sessionId,
        error: 'Please wait a moment before sending another message.',
      });
      return;
    }
    this.lastMessageTime.set(visitorId, now);

    try {
      const stream = this.chatService.handleStreamingMessage(
        sessionId,
        visitorId,
        message,
      );

      for await (const event of stream) {
        // Check if client is still connected
        if (!client.connected) {
          this.logger.warn(
            `Client ${client.id} disconnected during streaming. Backend will continue processing.`,
          );
          // Continue processing to persist the complete response
          continue;
        }

        switch (event.type) {
          case 'start':
            client.emit('message:start', {
              sessionId,
              messageId: event.messageId,
              role: 'ASSISTANT',
            });
            break;
          case 'chunk':
            client.emit('message:chunk', {
              sessionId,
              messageId: event.messageId,
              chunk: event.chunk,
            });
            break;
          case 'complete':
            client.emit('message:complete', {
              sessionId,
              messageId: event.messageId,
              content: event.content,
            });
            break;
          case 'error':
            client.emit('message:error', {
              sessionId,
              messageId: event.messageId || null,
              error: event.error,
            });
            break;
        }
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error handling message for session ${sessionId}: ${errorMsg}`,
      );

      if (client.connected) {
        client.emit('message:error', {
          messageId: null,
          sessionId,
          error:
            errorMsg === 'Access denied'
              ? 'Access denied'
              : 'An error occurred. Please try again.',
        });
      }
    }
  }
}
