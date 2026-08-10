import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IStorageService } from '../interfaces/storage-service.interface';
import {
  IDocumentRepository,
  KnowledgeDocumentWhereInput,
} from './repositories/document.repository.interface';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { GetDocumentsQueryDto } from './dto/get-documents-query.dto';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { DocumentParserFactory } from './parsers/document-parser.factory';
import { ChunkService } from './chunk.service';
import { IEmbeddingsService } from '../interfaces/embeddings-service.interface';
import { IVectorStoreService } from '../interfaces/vector-store.interface';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  private readonly allowedExtensions = ['.pdf', '.docx', '.txt', '.md'];
  private readonly allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
  ];

  constructor(
    @Inject(IStorageService)
    private readonly storageService: IStorageService,
    @Inject(IDocumentRepository)
    private readonly documentRepository: IDocumentRepository,
    private readonly parserFactory: DocumentParserFactory,
    private readonly chunkService: ChunkService,
    @Inject(IEmbeddingsService)
    private readonly embeddingsService: IEmbeddingsService,
    @Inject(IVectorStoreService)
    private readonly vectorStoreService: IVectorStoreService,
  ) {}

  async uploadDocument(file: Express.Multer.File, customTitle?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const fileExt = extname(file.originalname).toLowerCase();
    const isMimeAllowed = this.allowedMimeTypes.includes(file.mimetype);
    const isExtAllowed = this.allowedExtensions.includes(fileExt);

    if (!isMimeAllowed && !isExtAllowed) {
      throw new BadRequestException(
        `Unsupported file type. Supported types: PDF, DOCX, TXT, MD. Got mimetype: "${file.mimetype}" and extension: "${fileExt}"`,
      );
    }

    const uniqueFilename = `${randomUUID()}${fileExt}`;
    this.logger.log(
      `[STAGE 1/5 - UPLOAD] Storing file ${file.originalname} as ${uniqueFilename}`,
    );

    let documentId: string | null = null;

    try {
      // 1. Save file locally
      const storagePath = await this.storageService.saveFile(
        uniqueFilename,
        file.buffer,
      );
      this.logger.log(
        `[STAGE 1/5 - UPLOAD] File saved locally at: ${storagePath}`,
      );

      // 2. Create DB record with PROCESSING status
      const title = customTitle || file.originalname;
      const document = await this.documentRepository.create({
        title,
        filename: uniqueFilename,
        mimeType: file.mimetype,
        size: file.size,
        status: 'PROCESSING',
        chunkCount: 0,
      });
      documentId = document.id;
      this.logger.log(
        `[STAGE 2/5 - DATABASE] Created database metadata record with ID: ${documentId} (status: PROCESSING)`,
      );

      // 3. Extract text
      this.logger.log(
        `[STAGE 3/5 - EXTRACTION] Extracting text from ${uniqueFilename}`,
      );
      const parser = this.parserFactory.getParser(file.mimetype, fileExt);
      const cleanedText = await parser.parse(file.buffer);
      this.logger.log(
        `[STAGE 3/5 - EXTRACTION] Text extracted: ${cleanedText.length} characters`,
      );

      if (!cleanedText || cleanedText.trim() === '') {
        throw new BadRequestException(
          'Document contains no parseable text content',
        );
      }

      // 4. Chunk text
      this.logger.log(
        `[STAGE 4/5 - CHUNKING] Creating chunks for document ${documentId}`,
      );
      const chunks = this.chunkService.chunkDocument(documentId, cleanedText);
      this.logger.log(
        `[STAGE 4/5 - CHUNKING] Generated ${chunks.length} chunks`,
      );

      if (chunks.length === 0) {
        throw new BadRequestException(
          'Failed to generate any chunks from the document text',
        );
      }

      // 5. Generate Embeddings & Store in Vector Store
      this.logger.log(
        `[STAGE 5/5 - EMBEDDING & STORAGE] Generating embeddings and storing in Vector Store`,
      );
      const chunkTexts = chunks.map((c) => c.chunkText);
      const vectors =
        await this.embeddingsService.generateEmbeddings(chunkTexts);

      const ids = chunks.map((_, index) => `${documentId}-chunk-${index}`);
      const metadatas = chunks.map((c, index) => ({
        documentId: documentId!,
        filename: uniqueFilename,
        chunkIndex: index,
        text: c.chunkText,
      }));

      await this.vectorStoreService.insertVectors(
        ids,
        vectors,
        metadatas,
        chunkTexts,
      );
      this.logger.log(
        `[STAGE 5/5 - EMBEDDING & STORAGE] Stored ${ids.length} vector embeddings in Vector Store`,
      );

      // Update DB record to COMPLETED
      const completedDocument = await this.documentRepository.update(
        documentId,
        {
          status: 'COMPLETED',
          chunkCount: chunks.length,
        },
      );
      this.logger.log(
        `[PIPELINE SUCCESS] Processed document: ${completedDocument.title} (${completedDocument.id})`,
      );
      return completedDocument;
    } catch (error) {
      this.logger.error(
        `[PIPELINE FAILURE] Failed to process document ${file.originalname}. Rolling back changes...`,
        error instanceof Error ? error.stack : undefined,
      );

      // Rollback operations:
      // A. Delete physical file
      try {
        await this.storageService.deleteFile(uniqueFilename);
        this.logger.log(`[ROLLBACK] Physical file ${uniqueFilename} deleted`);
      } catch (err) {
        this.logger.error(
          `[ROLLBACK FAILURE] Failed to delete physical file ${uniqueFilename}`,
          err instanceof Error ? err.stack : undefined,
        );
      }

      // B. Delete vector store chunks
      if (documentId) {
        try {
          await this.vectorStoreService.deleteDocument(documentId);
          this.logger.log(
            `[ROLLBACK] Vector embeddings for document ${documentId} deleted`,
          );
        } catch (err) {
          this.logger.error(
            `[ROLLBACK FAILURE] Failed to delete vector embeddings for document ${documentId}`,
            err instanceof Error ? err.stack : undefined,
          );
        }

        // C. Update database metadata record to FAILED
        try {
          await this.documentRepository.update(documentId, {
            status: 'FAILED',
          });
          this.logger.log(
            `[ROLLBACK] Updated database record for document ${documentId} status to FAILED`,
          );
        } catch (err) {
          this.logger.error(
            `[ROLLBACK FAILURE] Failed to update database record status for document ${documentId} to FAILED`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }

      // Re-throw
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Document pipeline failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getDocuments(queryDto?: GetDocumentsQueryDto) {
    const page = queryDto?.page || 1;
    const limit = queryDto?.limit || 10;
    const search = queryDto?.search;
    const rawSort = queryDto?.sortField || queryDto?.sortBy || 'createdAt';
    const sortBy = rawSort === 'uploadedAt' ? 'createdAt' : rawSort;
    const sortOrder = queryDto?.sortOrder || 'desc';

    const skip = (page - 1) * limit;

    const where: KnowledgeDocumentWhereInput = {};
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { filename: { contains: search } },
      ];
    }

    const [documents, total] = await this.documentRepository.findManyAndCount({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    });

    const mappedData = documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      createdAt: doc.createdAt,
      size: doc.size,
      chunkCount: doc.chunkCount,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDocumentById(id: string) {
    const document = await this.documentRepository.findUnique(id);

    if (!document) {
      throw new NotFoundException(
        `KnowledgeDocument with ID "${id}" not found`,
      );
    }

    return document;
  }

  async updateDocument(id: string, updateDto: UpdateDocumentDto) {
    // Check if exists
    await this.getDocumentById(id);

    const updated = await this.documentRepository.update(id, updateDto);

    this.logger.log(`Updated document metadata: ${id}`);
    return updated;
  }

  async deleteDocument(id: string) {
    const document = await this.getDocumentById(id);

    let fileDeleted = false;
    let vectorsDeleted = false;

    // Delete local file
    try {
      await this.storageService.deleteFile(document.filename);
      this.logger.log(`Deleted file: ${document.filename}`);
      fileDeleted = true;
    } catch (err) {
      this.logger.error(
        `Failed to delete local file during document cleanup: ${document.filename}`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    // Delete vectors from vector store
    try {
      await this.vectorStoreService.deleteDocument(id);
      this.logger.log(
        `Deleted vector embeddings from vector store for document: ${id}`,
      );
      vectorsDeleted = true;
    } catch (err) {
      this.logger.error(
        `Failed to delete vector embeddings from vector store during document cleanup: ${id}`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    // Delete from db
    await this.documentRepository.delete(id);

    this.logger.log(`Successfully deleted KnowledgeDocument: ${id}`);
    return {
      success: true,
      deletedId: id,
      fileDeleted,
      vectorsDeleted,
    };
  }

  async extractText(id: string): Promise<string> {
    const document = await this.getDocumentById(id);
    this.logger.log(`Retrieving and parsing document text for ID: ${id}`);

    // Load file buffer from storage
    const buffer = await this.storageService.getFile(document.filename);

    // Fetch corresponding parser strategy from factory
    const parser = this.parserFactory.getParser(
      document.mimeType,
      extname(document.filename),
    );

    // Parse and return cleaned text
    const cleanedText = await parser.parse(buffer);
    this.logger.log(
      `Successfully parsed document ID: ${id} (${cleanedText.length} characters)`,
    );

    return cleanedText;
  }

  async replaceDocumentFile(id: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const document = await this.getDocumentById(id);
    const oldFilename = document.filename;

    const fileExt = extname(file.originalname).toLowerCase();
    const isMimeAllowed = this.allowedMimeTypes.includes(file.mimetype);
    const isExtAllowed = this.allowedExtensions.includes(fileExt);

    if (!isMimeAllowed && !isExtAllowed) {
      throw new BadRequestException(
        `Unsupported file type. Supported types: PDF, DOCX, TXT, MD. Got mimetype: "${file.mimetype}" and extension: "${fileExt}"`,
      );
    }

    const uniqueFilename = `${randomUUID()}${fileExt}`;
    this.logger.log(
      `[STAGE 1/5 - REPLACE] Storing replacement file ${file.originalname} as ${uniqueFilename} for document ${id}`,
    );

    let newFileSaved = false;

    try {
      // 1. Save new file locally
      const storagePath = await this.storageService.saveFile(
        uniqueFilename,
        file.buffer,
      );
      this.logger.log(
        `[STAGE 1/5 - REPLACE] Replacement file saved locally at: ${storagePath}`,
      );
      newFileSaved = true;

      // Update document record status to PROCESSING
      await this.documentRepository.update(id, { status: 'PROCESSING' });

      // 2. Extract text
      this.logger.log(
        `[STAGE 2/5 - REPLACE] Extracting text from replacement: ${uniqueFilename}`,
      );
      const parser = this.parserFactory.getParser(file.mimetype, fileExt);
      const cleanedText = await parser.parse(file.buffer);
      this.logger.log(
        `[STAGE 2/5 - REPLACE] Text extracted: ${cleanedText.length} characters`,
      );

      if (!cleanedText || cleanedText.trim() === '') {
        throw new BadRequestException(
          'Replacement document contains no parseable text content',
        );
      }

      // 3. Chunk text
      this.logger.log(
        `[STAGE 3/5 - REPLACE] Creating chunks for replacement document ${id}`,
      );
      const chunks = this.chunkService.chunkDocument(id, cleanedText);
      this.logger.log(
        `[STAGE 3/5 - REPLACE] Generated ${chunks.length} chunks`,
      );

      if (chunks.length === 0) {
        throw new BadRequestException(
          'Failed to generate any chunks from the replacement document text',
        );
      }

      // 4. Generate Embeddings for new chunks
      this.logger.log(
        `[STAGE 4/5 - REPLACE] Generating new embeddings for replacement document`,
      );
      const chunkTexts = chunks.map((c) => c.chunkText);
      const vectors =
        await this.embeddingsService.generateEmbeddings(chunkTexts);

      // 5. Swap vectors and storage files safely
      this.logger.log(
        `[STAGE 5/5 - REPLACE] Deleting old vectors and inserting new vectors`,
      );

      // A. Delete old vector embeddings from vector store
      try {
        await this.vectorStoreService.deleteDocument(id);
      } catch (err) {
        this.logger.warn(
          `Failed to delete old vector store embeddings for document: ${id} during replace (continuing): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // B. Insert new vectors into vector store
      const ids = chunks.map((_, index) => `${id}-chunk-${index}`);
      const metadatas = chunks.map((c, index) => ({
        documentId: id,
        filename: uniqueFilename,
        chunkIndex: index,
        text: c.chunkText,
      }));

      await this.vectorStoreService.insertVectors(
        ids,
        vectors,
        metadatas,
        chunkTexts,
      );

      // C. Delete old file from storage
      try {
        await this.storageService.deleteFile(oldFilename);
      } catch (err) {
        this.logger.warn(
          `Failed to delete old storage file: ${oldFilename} during replace (continuing): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // D. Update database record to COMPLETED with new details
      const title = file.originalname;
      const updatedDocument = await this.documentRepository.update(id, {
        title,
        filename: uniqueFilename,
        size: file.size,
        status: 'COMPLETED',
        chunkCount: chunks.length,
      });

      this.logger.log(
        `[REPLACE SUCCESS] Replaced and reprocessed document: ${updatedDocument.title} (${updatedDocument.id})`,
      );
      return updatedDocument;
    } catch (error) {
      this.logger.error(
        `[REPLACE FAILURE] Failed to replace document file for ID ${id}. Rolling back replacement changes...`,
        error instanceof Error ? error.stack : undefined,
      );

      // Rollback:
      // Clean up the new physical file if saved
      if (newFileSaved) {
        try {
          await this.storageService.deleteFile(uniqueFilename);
          this.logger.log(
            `[REPLACE ROLLBACK] Physical replacement file ${uniqueFilename} deleted`,
          );
        } catch (err) {
          this.logger.error(
            `[REPLACE ROLLBACK FAILURE] Failed to delete physical replacement file ${uniqueFilename}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }

      // Restore record to previous status
      try {
        await this.documentRepository.update(id, { status: document.status });
      } catch (err) {
        this.logger.error(
          `[REPLACE ROLLBACK FAILURE] Failed to restore document status for ID ${id}`,
          err instanceof Error ? err.stack : undefined,
        );
      }

      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Document replacement failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async reindex(): Promise<{
    total: number;
    succeeded: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    this.logger.log('Re-index started');
    const [documents] = await this.documentRepository.findManyAndCount({
      skip: 0,
      take: 1000,
    });

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const doc of documents) {
      this.logger.log(`Re-indexing document: ${doc.title} (${doc.id})`);
      try {
        await this.documentRepository.update(doc.id, { status: 'PROCESSING' });

        const buffer = await this.storageService.getFile(doc.filename);

        const parser = this.parserFactory.getParser(
          doc.mimeType,
          extname(doc.filename),
        );
        const cleanedText = await parser.parse(buffer);

        if (!cleanedText || cleanedText.trim() === '') {
          throw new Error('Document contains no parseable text content');
        }

        const chunks = this.chunkService.chunkDocument(doc.id, cleanedText);

        if (chunks.length === 0) {
          throw new Error('Failed to generate any chunks from the document text');
        }

        const chunkTexts = chunks.map((c) => c.chunkText);
        const vectors = await this.embeddingsService.generateEmbeddings(chunkTexts);

        try {
          await this.vectorStoreService.deleteDocument(doc.id);
        } catch (err) {
          this.logger.warn(
            `Failed to delete old vector store chunks for document ${doc.id} (continuing): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        const ids = chunks.map((_, index) => `${doc.id}-chunk-${index}`);
        const metadatas = chunks.map((c, index) => ({
          documentId: doc.id,
          filename: doc.filename,
          chunkIndex: index,
          text: c.chunkText,
        }));

        await this.vectorStoreService.insertVectors(
          ids,
          vectors,
          metadatas,
          chunkTexts,
        );

        await this.documentRepository.update(doc.id, {
          status: 'COMPLETED',
          chunkCount: chunks.length,
        });

        this.logger.log(`Successfully re-indexed document: ${doc.title} (${doc.id})`);
        succeeded.push(doc.id);
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Re-index failed for document ${doc.id}: ${errMsg}`);
        failed.push({ id: doc.id, error: errMsg });

        try {
          await this.documentRepository.update(doc.id, { status: 'FAILED' });
        } catch (updateErr) {
          this.logger.error(`Failed to mark document ${doc.id} as FAILED: ${updateErr}`);
        }
      }
    }

    if (failed.length > 0) {
      this.logger.error(`Re-index completed with ${failed.length} failures out of ${documents.length}`);
    } else {
      this.logger.log('Re-index completed successfully');
    }

    return {
      total: documents.length,
      succeeded,
      failed,
    };
  }
}

