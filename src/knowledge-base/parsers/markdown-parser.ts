import { Injectable } from '@nestjs/common';
import { BaseParser } from './base-parser';

@Injectable()
export class MarkdownParser extends BaseParser {
  supports(mimeType: string, extension: string): boolean {
    const ext = extension.toLowerCase();
    return (
      mimeType === 'text/markdown' ||
      mimeType === 'text/x-markdown' ||
      ext === '.md' ||
      ext === '.markdown'
    );
  }

  parse(buffer: Buffer): Promise<string> {
    const rawText = buffer.toString('utf-8');
    return Promise.resolve(this.cleanText(rawText));
  }
}
