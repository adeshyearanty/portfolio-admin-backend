import { Injectable } from '@nestjs/common';
import { BaseParser } from './base-parser';

@Injectable()
export class TxtParser extends BaseParser {
  supports(mimeType: string, extension: string): boolean {
    return mimeType === 'text/plain' || extension.toLowerCase() === '.txt';
  }

  parse(buffer: Buffer): Promise<string> {
    const rawText = buffer.toString('utf-8');
    return Promise.resolve(this.cleanText(rawText));
  }
}
