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
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
  embeddingModel: process.env.EMBEDDING_MODEL || 'nvidia/nemotron-3-embed-1b',
  embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384', 10),
  portfolioUrl: process.env.PORTFOLIO_URL || 'https://adeshyearanty.vercel.app',
  githubUrl: process.env.GITHUB_URL || 'https://github.com/adeshyearanty',
  linkedinUrl: process.env.LINKEDIN_URL || 'https://linkedin.com/in/adeshyearanty',
  resumeUrl: process.env.RESUME_URL || 'https://drive.google.com/file/d/187U4OfZ_woHsko3pPRY5eUDmSSrhvDEF/view?usp=sharing',
  projectsUrl: process.env.PROJECTS_URL || 'https://adeshyearanty.vercel.app/work',
  contactUrl: process.env.CONTACT_URL || 'https://adeshyearanty.vercel.app/contact',
}));
