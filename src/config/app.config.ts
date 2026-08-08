import { registerAs } from '@nestjs/config';
import { join } from 'path';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  storageDir:
    process.env.STORAGE_DIR || join(process.cwd(), 'storage/documents'),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  chromaHost: process.env.CHROMA_HOST || 'localhost',
  chromaPort: process.env.CHROMA_PORT || '8000',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-1234',
  whatsappVerifyToken: process.env.VERIFY_TOKEN || 'my-verify-token-1234',
  whatsappAccessToken: process.env.ACCESS_TOKEN || '',
  whatsappPhoneNumberId: process.env.PHONE_NUMBER_ID || '',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.35'),
}));
