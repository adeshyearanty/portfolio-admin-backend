import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  validateSync,
  Min,
  IsOptional,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX = 'api';

  @IsString()
  @IsOptional()
  GROQ_API_KEY = '';

  @IsString()
  @IsOptional()
  LLM_MODEL = 'openai/gpt-oss-120b';

  @IsString()
  @IsOptional()
  CLIENT_URL = 'http://localhost:4000';

  @IsString()
  @IsOptional()
  EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

  @IsString()
  @IsOptional()
  EMBEDDING_PROVIDER = 'local';

  @IsString()
  @IsOptional()
  EMBEDDING_DIMENSIONS = '384';

  @IsString()
  @IsOptional()
  JWT_SECRET = 'super-secret-key-1234';

  @IsString()
  @IsOptional()
  WHATSAPP_VERIFY_TOKEN = 'my-verify-token-1234';

  @IsString()
  @IsOptional()
  WHATSAPP_ACCESS_TOKEN = '';

  @IsString()
  @IsOptional()
  WHATSAPP_PHONE_NUMBER_ID = '';

  @IsString()
  @IsOptional()
  SIMILARITY_THRESHOLD = '0.15';

  @IsString()
  @IsOptional()
  MONGODB_URI = '';

  @IsString()
  @IsOptional()
  MONGODB_DATABASE = 'portfolio_admin';

  @IsString()
  @IsOptional()
  MONGODB_VECTOR_INDEX = 'vector_index';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  // Populate validated values back into process.env
  for (const [key, value] of Object.entries(validatedConfig)) {
    if (value !== undefined) {
      process.env[key] = String(value);
    }
  }

  return validatedConfig;
}
