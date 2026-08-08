import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class MessageDto {
  @ApiProperty({
    description: 'The user message to send to the AI Assistant',
    example: 'What is your experience with NestJS?',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  message: string;

  @ApiPropertyOptional({
    description: 'Optional session ID for conversation memory tracking',
    example: 'session-1234-abcd',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
