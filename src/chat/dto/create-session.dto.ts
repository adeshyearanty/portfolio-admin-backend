import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ChatChannel } from '../enums/chat.enums';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Anonymous visitor ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty()
  @IsString()
  visitorId: string;

  @ApiPropertyOptional({
    description: 'Chat channel',
    enum: ChatChannel,
    default: ChatChannel.WEB,
  })
  @IsEnum(ChatChannel)
  channel: ChatChannel = ChatChannel.WEB;
}
