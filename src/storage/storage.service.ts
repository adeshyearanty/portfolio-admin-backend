import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../interfaces/storage-service.interface';
import * as fs from 'fs/promises';
import { join } from 'path';

@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageDir: string;

  constructor(private readonly configService: ConfigService) {
    this.storageDir = this.configService.get<string>(
      'app.storageDir',
      join(process.cwd(), 'storage/documents'),
    );
  }

  async saveFile(path: string, buffer: Buffer): Promise<string> {
    const fullPath = join(this.storageDir, path);
    this.logger.log(
      `Saving file to path: ${fullPath} (size: ${buffer.length} bytes)`,
    );
    // Ensure the storage directory exists
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return fullPath;
  }

  async getFile(path: string): Promise<Buffer> {
    const fullPath = join(this.storageDir, path);
    this.logger.log(`Getting file from path: ${fullPath}`);
    return await fs.readFile(fullPath);
  }

  async deleteFile(path: string): Promise<void> {
    const fullPath = join(this.storageDir, path);
    this.logger.log(`Deleting file from path: ${fullPath}`);
    await fs.rm(fullPath, { force: true });
  }
}
