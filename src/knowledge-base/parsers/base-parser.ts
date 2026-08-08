import { IDocumentParser } from '../../interfaces/document-parser.interface';

export abstract class BaseParser implements IDocumentParser {
  abstract supports(mimeType: string, extension: string): boolean;
  abstract parse(buffer: Buffer): Promise<string>;

  protected cleanText(text: string): string {
    if (!text) return '';

    // Normalize line endings to standard Unix newlines
    let cleaned = text.replace(/\r\n/g, '\n');

    // Replace duplicate horizontal spaces (spaces and tabs) with a single space
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    // Reduce multiple consecutive blank lines to at most 2 consecutive newlines,
    // which cleans up spacing while preserving paragraph boundaries and headings.
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');

    return cleaned.trim();
  }
}
