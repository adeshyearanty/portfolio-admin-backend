export interface IDocumentParser {
  supports(mimeType: string, extension: string): boolean;
  parse(buffer: Buffer): Promise<string>;
}
