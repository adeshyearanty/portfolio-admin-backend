import { Injectable } from '@nestjs/common';
import { BaseParser } from './base-parser';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxParser extends BaseParser {
  supports(mimeType: string, extension: string): boolean {
    return (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension.toLowerCase() === '.docx'
    );
  }

  async parse(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return this.cleanText(result.value);
  }
}
