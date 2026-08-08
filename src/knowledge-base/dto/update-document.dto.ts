import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, IsIn } from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({
    description: 'Updated title of the document',
    example: 'My Main Resume',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated status of the document',
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
  status?: string;
}
