import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
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
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { GetDocumentsQueryDto } from './dto/get-documents-query.dto';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a knowledge document (PDF, DOCX, TXT, MD)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to upload',
        },
        title: {
          type: 'string',
          description: 'Optional custom title for the document',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Document uploaded and registered successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid file format or empty file upload',
  })
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadDocumentDto,
  ) {
    return this.knowledgeBaseService.uploadDocument(file, uploadDto.title);
  }

  @Get()
  @ApiOperation({ summary: 'List all registered knowledge documents' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of documents retrieved',
  })
  async getDocuments(@Query() query: GetDocumentsQueryDto) {
    return this.knowledgeBaseService.getDocuments(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single knowledge document' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document details retrieved',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async getDocumentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledgeBaseService.getDocumentById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update metadata for a knowledge document' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document metadata updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateDocumentDto,
  ) {
    return this.knowledgeBaseService.updateDocument(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document and its local file' })
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

  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process document, parse, and return cleaned extracted text',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Extracted cleaned text from document successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async processDocument(@Param('id', ParseUUIDPipe) id: string) {
    const text = await this.knowledgeBaseService.extractText(id);
    return { text };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-index existing documents using the local embedding model into MongoDB',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document re-indexing completed',
  })
  async reindex() {
    return this.knowledgeBaseService.reindex();
  }
}
