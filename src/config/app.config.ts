import { registerAs } from '@nestjs/config';
import { join } from 'path';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  storageDir:
    process.env.STORAGE_DIR || join(process.cwd(), 'storage/documents'),
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-1234',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'my-verify-token-1234',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.35'),
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDatabase: process.env.MONGODB_DATABASE || 'portfolio_admin',
  mongodbVectorIndex: process.env.MONGODB_VECTOR_INDEX || 'vector_index',
}));
