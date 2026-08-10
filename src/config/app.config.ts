import { registerAs } from '@nestjs/config';
import { join } from 'path';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  storageDir:
    process.env.STORAGE_DIR || join(process.cwd(), 'storage/documents'),
  groqApiKey: process.env.GROQ_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-1234',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'my-verify-token-1234',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.15'),
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'portfolio_admin',
  mongodbVectorIndex: process.env.MONGODB_VECTOR_INDEX || 'vector_index',
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  embeddingModel: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10),
}));
