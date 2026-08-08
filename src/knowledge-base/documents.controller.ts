import {
  Controller,
  Get,
  Delete,
  Patch,
  Query,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';
import { GetDocumentsQueryDto } from './dto/get-documents-query.dto';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  @ApiOperation({
    summary: 'List all documents with pagination, search, and sorting',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of documents retrieved successfully',
  })
  async getDocuments(@Query() query: GetDocumentsQueryDto) {
    return this.knowledgeBaseService.getDocuments(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a document and its local file and vectors',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async deleteDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeBaseService.deleteDocument(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Replace a document file, automatically re-processing and re-indexing it',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'New document file to replace the old one',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document replaced and reprocessed successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async replaceFile(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.knowledgeBaseService.replaceDocumentFile(id, file);
  }
}
