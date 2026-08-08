import { Injectable, BadRequestException } from '@nestjs/common';
import { IDocumentParser } from '../../interfaces/document-parser.interface';
import { TxtParser } from './txt-parser';
import { MarkdownParser } from './markdown-parser';
import { PdfParser } from './pdf-parser';
import { DocxParser } from './docx-parser';

@Injectable()
export class DocumentParserFactory {
  private readonly parsers: IDocumentParser[];

  constructor(
    private readonly txtParser: TxtParser,
    private readonly markdownParser: MarkdownParser,
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
  ) {
    this.parsers = [
      this.txtParser,
      this.markdownParser,
      this.pdfParser,
      this.docxParser,
    ];
  }

  getParser(mimeType: string, extension: string): IDocumentParser {
    const parser = this.parsers.find((p) => p.supports(mimeType, extension));
    if (!parser) {
      throw new BadRequestException(
        `No document parser found for file type: ${mimeType} (${extension})`,
      );
    }
    return parser;
  }
}
