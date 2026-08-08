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
  GOOGLE_API_KEY = '';

  @IsString()
  @IsOptional()
  CLIENT_URL = 'http://localhost:4000';

  @IsString()
  @IsOptional()
  EMBEDDING_MODEL = 'gemini-embedding-2';

  @IsString()
  @IsOptional()
  CHAT_MODEL = 'gemini-2.5-flash';

  @IsString()
  @IsOptional()
  JWT_SECRET = 'super-secret-key-1234';

  @IsString()
  @IsOptional()
  VERIFY_TOKEN = 'my-verify-token-1234';

  @IsString()
  @IsOptional()
  ACCESS_TOKEN = '';

  @IsString()
  @IsOptional()
  PHONE_NUMBER_ID = '';

  @IsString()
  @IsOptional()
  SIMILARITY_THRESHOLD = '0.35';

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
