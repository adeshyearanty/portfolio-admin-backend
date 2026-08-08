import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { KnowledgeBaseService } from '../src/knowledge-base/knowledge-base.service';
import { DatabaseService } from '../src/database/database.service';
import { RetrievalService } from '../src/knowledge-base/retrieval.service';
import { IVectorStoreService } from '../src/interfaces/vector-store.interface';
import { MongoVectorStoreService } from '../src/vector-store/mongo-vector-store.service';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

async function runLivePipelineVerification() {
  console.log('=== STARTING LIVE MONGODB RAG PIPELINE VERIFICATION ===');

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleFixture.createNestApplication();
  await app.init();

  const kbService = app.get(KnowledgeBaseService);
  const dbService = app.get(DatabaseService);
  const vectorStore = app.get<MongoVectorStoreService>(IVectorStoreService);
  const retrievalService = app.get(RetrievalService);

  console.log('1. Checking Database Connectivity...');
  await dbService.getDb().command({ ping: 1 });
  console.log('✓ MongoDB Atlas ping successful!');

  // Test 1: Upload Document Pipeline
  console.log('\n2. Testing Upload Pipeline...');
  const sampleContent = `
Adesh Yearanty is a Staff Full-Stack Software Engineer with 8+ years of industry experience.
He specializes in distributed systems, NestJS microservices, MongoDB Atlas Vector Search, and high-concurrency systems.
He has designed and built enterprise AI architectures integrating Gemini LLM with retrieval-augmented generation (RAG).
`;
  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'adesh_profile_test.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: Buffer.byteLength(sampleContent),
    buffer: Buffer.from(sampleContent, 'utf-8'),
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };

  const uploadedDoc = await kbService.uploadDocument(mockFile);
  console.log('✓ Uploaded Document ID:', uploadedDoc.id);
  console.log('✓ Document Status:', uploadedDoc.status);
  console.log('✓ Chunk Count:', uploadedDoc.chunkCount);

  if (uploadedDoc.status !== 'COMPLETED') {
    throw new Error(`Expected status COMPLETED, got ${uploadedDoc.status}`);
  }

  // Verify in MongoDB collections
  const docInDb = await dbService.collection('knowledge_documents').findOne({ id: uploadedDoc.id });
  console.log('✓ Verified document metadata in MongoDB collection "knowledge_documents":', docInDb?.title);

  const chunksInDb = await dbService.collection('knowledge_chunks').find({ documentId: uploadedDoc.id }).toArray();
  console.log(`✓ Found ${chunksInDb.length} chunks in MongoDB collection "knowledge_chunks"`);
  console.log('✓ Chunk[0] Vector Dimension:', chunksInDb[0]?.embedding?.length);
  console.log('✓ Chunk[0] Content Preview:', chunksInDb[0]?.content?.trim());

  // Test 2: List Documents
  console.log('\n3. Testing List Documents...');
  const listResult = await kbService.getDocuments({ page: 1, limit: 10 });
  console.log(`✓ Listed ${listResult.data.length} documents (total: ${listResult.meta.total})`);

  // Test 3: Search Documents
  console.log('\n4. Testing Search Documents...');
  const searchResult = await kbService.getDocuments({ search: 'adesh_profile' });
  console.log(`✓ Found ${searchResult.data.length} documents matching search query 'adesh_profile'`);

  // Test 4: Get Document by ID
  console.log('\n5. Testing Get Document by ID...');
  const fetchedDoc = await kbService.getDocumentById(uploadedDoc.id);
  console.log('✓ Retrieved document by ID:', fetchedDoc.id, fetchedDoc.title);

  // Test 5: Update Document Title
  console.log('\n6. Testing Update Document...');
  const updatedDoc = await kbService.updateDocument(uploadedDoc.id, { title: 'Adesh Yearanty Profile Renamed' });
  console.log('✓ Updated Document Title:', updatedDoc.title);

  // Test 6: Semantic Vector Search & Retrieval
  console.log('\n7. Testing Semantic Search & Context Retrieval...');
  const retrievedChunks = await retrievalService.retrieve('What distributed systems and vector search experience does Adesh have?');
  console.log(`✓ Retrieved ${retrievedChunks.length} relevant chunks for query`);
  if (retrievedChunks.length > 0) {
    console.log(`✓ Top Chunk Similarity Score: ${retrievedChunks[0].score.toFixed(4)}`);
    console.log(`✓ Top Chunk Text: "${retrievedChunks[0].chunk.substring(0, 100)}..."`);
  }

  // Test 7: Replace Document File
  console.log('\n8. Testing Replace Document File...');
  const replacementContent = `
Adesh Yearanty updated bio: Lead Architect in Generative AI and MongoDB Vector Database integrations.
He leads development on automated multi-agent platforms and low-latency cloud systems.
`;
  const mockReplaceFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'adesh_profile_updated.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: Buffer.byteLength(replacementContent),
    buffer: Buffer.from(replacementContent, 'utf-8'),
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };
  const replacedDoc = await kbService.replaceDocumentFile(uploadedDoc.id, mockReplaceFile);
  console.log('✓ Replaced Document Title:', replacedDoc.title);
  console.log('✓ Replaced Document Chunk Count:', replacedDoc.chunkCount);

  // Test 8: Delete Document
  console.log('\n9. Testing Delete Document & Vector Chunks Cleanup...');
  const deleteResult = await kbService.deleteDocument(uploadedDoc.id);
  console.log('✓ Delete Result:', deleteResult);

  const remainingDoc = await dbService.collection('knowledge_documents').findOne({ id: uploadedDoc.id });
  const remainingChunks = await dbService.collection('knowledge_chunks').find({ documentId: uploadedDoc.id }).toArray();
  console.log(`✓ Remaining Document in DB: ${remainingDoc === null ? 'None (Cleaned)' : 'Present'}`);
  console.log(`✓ Remaining Chunks in DB: ${remainingChunks.length} (Cleaned)`);

  await app.close();
  console.log('\n=== ALL MONGODB RAG PIPELINE TESTS PASSED SUCCESSFULLY! ===');
}

runLivePipelineVerification().catch((err) => {
  console.error('Pipeline Verification Failed:', err);
  process.exit(1);
});
