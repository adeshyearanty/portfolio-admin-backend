import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatSessionService } from './chat-session.service';
import { MessageDto } from './dto/message.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatChannel } from './enums/chat.enums';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message to the AI Portfolio Assistant' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successful assistant response',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid body parameters',
  })
  async sendMessage(@Body() messageDto: MessageDto): Promise<ChatResponseDto> {
    return this.chatService.handleUserMessage(
      messageDto.message,
      messageDto.sessionId,
      messageDto.channel || 'web',
    );
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new chat session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Session created successfully',
  })
  async createSession(@Body() dto: CreateSessionDto) {
    const session = await this.chatSessionService.createSession(
      dto.visitorId,
      dto.channel,
    );
    return {
      id: session.id,
      visitorId: session.visitorId,
      title: session.title,
      channel: session.channel,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastMessageAt: session.lastMessageAt,
    };
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get chat sessions for a visitor' })
  @ApiQuery({ name: 'visitorId', required: true })
  @ApiQuery({ name: 'channel', required: false, enum: ChatChannel })
  async getSessions(
    @Query('visitorId') visitorId: string,
    @Query('channel') channel?: ChatChannel,
  ) {
    if (!visitorId) {
      return [];
    }
    const sessions = await this.chatSessionService.getSessions(
      visitorId,
      channel || ChatChannel.WEB,
    );
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      channel: s.channel,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastMessageAt: s.lastMessageAt,
      messageCount: s.messageCount,
    }));
  }

  @Get('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a conversation with messages' })
  @ApiQuery({ name: 'visitorId', required: true })
  async getConversation(
    @Param('sessionId') sessionId: string,
    @Query('visitorId') visitorId: string,
  ) {
    return this.chatSessionService.getConversation(sessionId, visitorId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chat session and its messages' })
  @ApiQuery({ name: 'visitorId', required: true })
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @Query('visitorId') visitorId: string,
  ) {
    await this.chatSessionService.deleteSession(sessionId, visitorId);
  }
}
