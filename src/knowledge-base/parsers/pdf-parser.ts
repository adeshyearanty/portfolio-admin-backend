import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { BaseParser } from './base-parser';

@Injectable()
export class PdfParser extends BaseParser {
  supports(mimeType: string, extension: string): boolean {
    return (
      mimeType === 'application/pdf' ||
      extension.toLowerCase() === '.pdf'
    );
  }

  async parse(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
    });

    try {
      const result = await parser.getText();
      return this.cleanText(result.text);
    } finally {
      await parser.destroy();
    }
  }
}