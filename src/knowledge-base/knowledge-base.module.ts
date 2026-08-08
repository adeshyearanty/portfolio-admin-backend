import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { StorageModule } from '../storage/storage.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';

import { KnowledgeBaseController } from './knowledge-base.controller';
import { DocumentsController } from './documents.controller';
import { TxtParser } from './parsers/txt-parser';
import { MarkdownParser } from './parsers/markdown-parser';
import { PdfParser } from './parsers/pdf-parser';
import { DocxParser } from './parsers/docx-parser';
import { DocumentParserFactory } from './parsers/document-parser.factory';
import { ChunkService } from './chunk.service';
import { RetrievalService } from './retrieval.service';
import { IDocumentRepository } from './repositories/document.repository.interface';
import { MongoDocumentRepository } from './repositories/mongo-document.repository';

@Module({
  imports: [StorageModule, EmbeddingsModule, VectorStoreModule],
  controllers: [KnowledgeBaseController, DocumentsController],
  providers: [
    KnowledgeBaseService,
    TxtParser,
    MarkdownParser,
    PdfParser,
    DocxParser,
    DocumentParserFactory,
    ChunkService,
    RetrievalService,
    {
      provide: IDocumentRepository,
      useClass: MongoDocumentRepository,
    },
  ],
  exports: [
    KnowledgeBaseService,
    DocumentParserFactory,
    ChunkService,
    RetrievalService,
  ],
})
export class KnowledgeBaseModule {}
