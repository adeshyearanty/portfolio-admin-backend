import { ApiProperty } from '@nestjs/swagger';

export class SourceDto {
  @ApiProperty({
    description: 'ID of the source document',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  documentId: string;

  @ApiProperty({
    description: 'Filename of the source document',
    example: 'my-resume.pdf',
  })
  filename: string;

  @ApiProperty({
    description: 'Index of the chunk used',
    example: 2,
  })
  chunkIndex: number;
}

export class ChatResponseDto {
  @ApiProperty({
    description: 'The generated answer from the assistant',
    example: 'Adesh is a software engineer with 5 years of NestJS experience.',
  })
  answer: string;

  @ApiProperty({
    type: [SourceDto],
    description: 'List of sources used to compile the answer',
  })
  sources: SourceDto[];

  @ApiProperty({
    required: false,
    description: 'Structured response object for interactive channels',
  })
  structuredResponse?: any;

  @ApiProperty({
    required: false,
    description: 'Formatted Meta WhatsApp Cloud API payload',
  })
  whatsappPayload?: any;
}
