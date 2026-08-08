import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UploadDocumentDto {
  @ApiPropertyOptional({
    description: 'Optional custom title for the document',
    example: 'My Resume 2026',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
