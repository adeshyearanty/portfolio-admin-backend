import { IsOptional, IsInt, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetDocumentsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit size', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Search term matching title or filename',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: ['title', 'filename', 'createdAt', 'uploadedAt', 'size', 'chunkCount'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'filename', 'createdAt', 'uploadedAt', 'size', 'chunkCount'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Alias for sortBy',
    enum: ['title', 'filename', 'createdAt', 'uploadedAt', 'size', 'chunkCount'],
  })
  @IsOptional()
  @IsIn(['title', 'filename', 'createdAt', 'uploadedAt', 'size', 'chunkCount'])
  sortField?: string;

  @ApiPropertyOptional({
    description: 'Sort order direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
