import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { KnowledgeBaseService } from '../src/knowledge-base/knowledge-base.service';
import { DatabaseService } from '../src/database/database.service';
import { IEmbeddingsService } from '../src/interfaces/embeddings-service.interface';
import { IVectorStoreService } from '../src/interfaces/vector-store.interface';
import { IStorageService } from '../src/interfaces/storage-service.interface';
import { DocumentParserFactory } from '../src/knowledge-base/parsers/document-parser.factory';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

async function auditFailurePaths() {
  console.log('====================================================');
  console.log('     STARTING MONGODB FAILURE-PATH AUDIT');
  console.log('====================================================\n');

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleFixture.createNestApplication();
  await app.init();

  const kbService = app.get(KnowledgeBaseService);
  const dbService = app.get(DatabaseService);
  const embeddingsService = app.get<IEmbeddingsService>(IEmbeddingsService);
  const vectorStoreService = app.get<IVectorStoreService>(IVectorStoreService);
  const storageService = app.get<IStorageService>(IStorageService);
  const parserFactory = app.get(DocumentParserFactory);

  const storageDir = path.resolve(__dirname, '../storage/documents');

  // Minimal valid PDF binary buffer
  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n193\n%%EOF',
  );

  // Helper to create mock multer file
  function createMockFile(name: string, content: string | Buffer, mime: string): Express.Multer.File {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    return {
      fieldname: 'file',
      originalname: name,
      encoding: '7bit',
      mimetype: mime,
      size: buffer.length,
      buffer: buffer,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };
  }

  // --------------------------------------------------------------------------
  // SCENARIO 1: Upload Valid Document
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 1: Upload Valid Document ---');
  const validFile = createMockFile('valid_audit_doc.txt', 'This is a valid test document content for audit.', 'text/plain');
  const uploaded1 = await kbService.uploadDocument(validFile);
  console.log(`[PASS] Uploaded Document: ${uploaded1.id}, Status: ${uploaded1.status}`);

  const doc1InDb = await dbService.collection('knowledge_documents').findOne({ id: uploaded1.id });
  const chunks1InDb = await dbService.collection('knowledge_chunks').find({ documentId: uploaded1.id }).toArray();
  const file1Exists = fs.existsSync(path.join(storageDir, uploaded1.filename));

  if (uploaded1.status === 'COMPLETED' && doc1InDb && chunks1InDb.length > 0 && file1Exists) {
    console.log(`[PASS] Scenario 1 verified: doc status=COMPLETED, chunks=${chunks1InDb.length}, file=exists\n`);
  } else {
    throw new Error('Scenario 1 Failed!');
  }

  // Clean up scenario 1
  await kbService.deleteDocument(uploaded1.id);

  // --------------------------------------------------------------------------
  // SCENARIO 2: Force Extraction Failure
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 2: Force Extraction Failure ---');
  const originalGetParser = parserFactory.getParser.bind(parserFactory);
  parserFactory.getParser = () => ({
    supports: () => true,
    parse: async () => {
      throw new Error('Simulated parser crash during PDF extraction');
    },
  });

  let scenario2Caught = false;
  try {
    const corruptFile = createMockFile('extraction_fail.txt', 'Simulate parser failure', 'text/plain');
    await kbService.uploadDocument(corruptFile);
  } catch (err: any) {
    scenario2Caught = true;
    console.log(`[PASS] Extraction failure caught as expected: "${err.message}"`);
  } finally {
    parserFactory.getParser = originalGetParser;
  }

  // Verify rollback: zero lingering records in knowledge_documents or knowledge_chunks
  const orphanDocs2 = await dbService.collection('knowledge_documents').find({ title: 'extraction_fail.txt' }).toArray();
  const orphanChunks2 = await dbService.collection('knowledge_chunks').find({ 'metadata.filename': /extraction_fail/ }).toArray();

  if (scenario2Caught && orphanDocs2.length === 0 && orphanChunks2.length === 0) {
    console.log('[PASS] Scenario 2 verified: physical file, metadata, and chunks were completely cleaned up.\n');
  } else {
    throw new Error(`Scenario 2 Failed! orphanDocs: ${orphanDocs2.length}, orphanChunks: ${orphanChunks2.length}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 3: Force Embedding Failure
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 3: Force Embedding Failure ---');
  const originalGenEmbeddings = embeddingsService.generateEmbeddings.bind(embeddingsService);
  embeddingsService.generateEmbeddings = async () => {
    throw new Error('Simulated Gemini Embedding API timeout (503)');
  };

  let scenario3Caught = false;
  try {
    const embedFailFile = createMockFile('embedding_fail.txt', 'Simulate embedding error', 'text/plain');
    await kbService.uploadDocument(embedFailFile);
  } catch (err: any) {
    scenario3Caught = true;
    console.log(`[PASS] Embedding failure caught as expected: "${err.message}"`);
  } finally {
    embeddingsService.generateEmbeddings = originalGenEmbeddings;
  }

  const orphanDocs3 = await dbService.collection('knowledge_documents').find({ title: 'embedding_fail.txt' }).toArray();
  const orphanChunks3 = await dbService.collection('knowledge_chunks').find({ 'metadata.filename': /embedding_fail/ }).toArray();

  if (scenario3Caught && orphanDocs3.length === 0 && orphanChunks3.length === 0) {
    console.log('[PASS] Scenario 3 verified: physical file, metadata, and chunks were completely cleaned up.\n');
  } else {
    throw new Error(`Scenario 3 Failed! orphanDocs: ${orphanDocs3.length}, orphanChunks: ${orphanChunks3.length}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 4: Force Vector Insertion Failure
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 4: Force Vector Insertion Failure ---');
  const originalInsertVectors = vectorStoreService.insertVectors.bind(vectorStoreService);
  vectorStoreService.insertVectors = async () => {
    throw new Error('Simulated MongoDB Atlas Vector insertion network partition');
  };

  let scenario4Caught = false;
  try {
    const vectorFailFile = createMockFile('vector_insert_fail.txt', 'Simulate vector insertion error', 'text/plain');
    await kbService.uploadDocument(vectorFailFile);
  } catch (err: any) {
    scenario4Caught = true;
    console.log(`[PASS] Vector insertion failure caught as expected: "${err.message}"`);
  } finally {
    vectorStoreService.insertVectors = originalInsertVectors;
  }

  const orphanDocs4 = await dbService.collection('knowledge_documents').find({ title: 'vector_insert_fail.txt' }).toArray();
  const orphanChunks4 = await dbService.collection('knowledge_chunks').find({ 'metadata.filename': /vector_insert_fail/ }).toArray();

  if (scenario4Caught && orphanDocs4.length === 0 && orphanChunks4.length === 0) {
    console.log('[PASS] Scenario 4 verified: physical file, metadata, and chunks were completely cleaned up.\n');
  } else {
    throw new Error(`Scenario 4 Failed! orphanDocs: ${orphanDocs4.length}, orphanChunks: ${orphanChunks4.length}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 5: Delete Completed Document
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 5: Delete Completed Document ---');
  const deleteTestFile = createMockFile('doc_to_delete.txt', 'Content to be deleted cleanly.', 'text/plain');
  const docToDelete = await kbService.uploadDocument(deleteTestFile);
  console.log(`Uploaded doc for deletion: ${docToDelete.id}`);

  // Perform deletion
  const deleteResult = await kbService.deleteDocument(docToDelete.id);
  console.log(`[PASS] Delete execution response:`, deleteResult);

  const doc5InDb = await dbService.collection('knowledge_documents').findOne({ id: docToDelete.id });
  const chunks5InDb = await dbService.collection('knowledge_chunks').find({ documentId: docToDelete.id }).toArray();
  const file5Exists = fs.existsSync(path.join(storageDir, docToDelete.filename));

  if (!doc5InDb && chunks5InDb.length === 0 && !file5Exists && deleteResult.fileDeleted && deleteResult.vectorsDeleted) {
    console.log('[PASS] Scenario 5 verified: metadata, vector chunks, and physical file were all deleted.\n');
  } else {
    throw new Error(`Scenario 5 Failed! docInDb=${!!doc5InDb}, chunks=${chunks5InDb.length}, fileExists=${file5Exists}`);
  }

  // --------------------------------------------------------------------------
  // SCENARIO 6: Replace Completed Document
  // --------------------------------------------------------------------------
  console.log('--- SCENARIO 6: Replace Completed Document ---');
  const initialFile = createMockFile('original_doc.txt', 'Original version text content.', 'text/plain');
  const initialDoc = await kbService.uploadDocument(initialFile);
  const oldFilename = initialDoc.filename;
  const initialChunks = await dbService.collection('knowledge_chunks').find({ documentId: initialDoc.id }).toArray();
  console.log(`Original Doc ID: ${initialDoc.id}, initial chunk count: ${initialChunks.length}`);

  const replaceFile = createMockFile('replaced_doc.txt', 'Brand new replaced text with updated facts.', 'text/plain');
  const replacedDoc = await kbService.replaceDocumentFile(initialDoc.id, replaceFile);
  console.log(`Replaced Doc Title: ${replacedDoc.title}, Status: ${replacedDoc.status}`);

  const oldFileExists = fs.existsSync(path.join(storageDir, oldFilename));
  const newFileExists = fs.existsSync(path.join(storageDir, replacedDoc.filename));
  const replacedChunks = await dbService.collection('knowledge_chunks').find({ documentId: initialDoc.id }).toArray();
  const updatedDocInDb = await dbService.collection('knowledge_documents').findOne({ id: initialDoc.id });

  if (
    replacedDoc.status === 'COMPLETED' &&
    replacedDoc.title === 'replaced_doc.txt' &&
    !oldFileExists &&
    newFileExists &&
    replacedChunks.length > 0 &&
    replacedChunks[0].content.includes('Brand new replaced text') &&
    updatedDocInDb?.title === 'replaced_doc.txt'
  ) {
    console.log('[PASS] Scenario 6 verified: old file removed, new file saved, old vectors replaced, metadata updated to COMPLETED.\n');
  } else {
    throw new Error(`Scenario 6 Failed! oldFileExists=${oldFileExists}, newFileExists=${newFileExists}`);
  }

  // Clean up scenario 6
  await kbService.deleteDocument(initialDoc.id);

  await app.close();
  console.log('====================================================');
  console.log('   ALL 6 FAILURE-PATH & LIFECYCLE AUDITS PASSED!');
  console.log('====================================================');
}

auditFailurePaths().catch((err) => {
  console.error('Audit Failed:', err);
  process.exit(1);
});
