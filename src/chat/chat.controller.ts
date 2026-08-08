import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { MessageDto } from './dto/message.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
    );
  }
}
