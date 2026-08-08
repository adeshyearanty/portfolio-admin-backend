import { Test, TestingModule } from '@nestjs/testing';
import { ChunkService } from './chunk.service';

describe('ChunkService', () => {
  let service: ChunkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkService],
    }).compile();

    service = module.get<ChunkService>(ChunkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty or null text', () => {
      expect(service.estimateTokens('')).toBe(0);
      expect(service.estimateTokens('   ')).toBe(0);
    });

    it('should estimate based on words', () => {
      const text = 'Hello world from NestJS';
      // 4 words. 4 * 1.3 = 5.2 -> ceil is 6
      expect(service.estimateTokens(text)).toBe(6);
    });

    it('should fallback to character count divided by 4 for symbol-dense content', () => {
      const text = 'a!@#$%^&*()_+{}[]|\\:;"\'<>,.?/~`';
      // 31 characters. 31/4 = 7.75 -> ceil is 8
      expect(service.estimateTokens(text)).toBe(8);
    });
  });

  describe('chunkDocument', () => {
    it('should return empty list for empty document', () => {
      expect(service.chunkDocument('doc-1', '')).toEqual([]);
      expect(service.chunkDocument('doc-1', '   ')).toEqual([]);
    });

    it('should group paragraphs and keep headings whole', () => {
      const text = `
# Introduction

This is the first paragraph.
It spans multiple lines.

# Section 2

This is the second paragraph.
It should go into the same chunk if it fits.
`;
      const chunks = service.chunkDocument('doc-1', text);
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].documentId).toBe('doc-1');
      expect(chunks[0].chunkText).toContain('# Introduction');
      expect(chunks[0].chunkText).toContain('# Section 2');
    });

    it('should split document when token size exceeds 600', () => {
      // Create a document with many large paragraphs
      const largeParagraph = new Array(300).fill('word').join(' '); // ~390 tokens
      const docText = `
# Heading 1
${largeParagraph}

# Heading 2
${largeParagraph}
`;
      const chunks = service.chunkDocument('doc-1', docText);
      // First chunk will fit Heading 1 + first paragraph (~400 tokens). Adding Heading 2 + second paragraph would exceed 600.
      // So it will create 2 chunks.
      expect(chunks.length).toBe(2);
      expect(chunks[0].chunkText).toContain('# Heading 1');
      expect(chunks[1].chunkText).toContain('# Heading 2');
    });

    it('should never split inside a code block', () => {
      // Code block with ~150 words (~195 tokens)
      const codeBlock =
        '```typescript\n' +
        new Array(30).fill('const x = 1;').join('\n') +
        '\n```';
      const largeParagraph = new Array(250).fill('word').join(' '); // ~325 tokens

      const docText = `
# Heading 1
${largeParagraph}

${codeBlock}
`;
      // Combined: ~325 + ~195 + heading tokens = ~530 tokens.
      // If we add another paragraph, it will force split, but codeBlock should be intact.
      const chunks = service.chunkDocument(
        'doc-1',
        docText + `\n\n# Heading 2\n${largeParagraph}`,
      );

      expect(chunks.length).toBe(2);

      // Verify that code block is kept completely intact in chunk 1 (since it starts there and fits)
      // or chunk 2, and is not split in half.
      const chunk1Text = chunks[0].chunkText;
      const chunk2Text = chunks[1].chunkText;

      // Let's assert codeBlock is either completely in chunk 1 or completely in chunk 2
      const blockInChunk1 =
        chunk1Text.includes('```typescript') &&
        chunk1Text.includes('const x = 1;');
      const blockInChunk2 =
        chunk2Text.includes('```typescript') &&
        chunk2Text.includes('const x = 1;');

      expect(blockInChunk1 || blockInChunk2).toBe(true);

      // Check that code block boundary characters aren't split across chunks
      expect(chunk1Text.split('```').length - 1).toBe(2); // Should have exactly 2 sets of triple backticks in chunk 1 (if it fits) or 0
    });

    it('should apply overlap correctly', () => {
      const p1 = new Array(250).fill('alpha').join(' '); // ~325 tokens
      const p2 = new Array(60).fill('beta').join(' '); // ~78 tokens (fits in overlap)
      const p3 = new Array(250).fill('gamma').join(' '); // ~325 tokens

      const docText = `${p1}\n\n${p2}\n\n${p3}`;
      const chunks = service.chunkDocument('doc-1', docText);

      expect(chunks.length).toBe(2);
      // Chunk 1 will contain p1 + p2
      // Chunk 2 will contain overlap (p2) + p3
      expect(chunks[0].chunkText).toContain('alpha');
      expect(chunks[0].chunkText).toContain('beta');
      expect(chunks[1].chunkText).toContain('beta');
      expect(chunks[1].chunkText).toContain('gamma');
      expect(chunks[1].chunkText).not.toContain('alpha'); // p1 does not fit in the 100 token overlap
    });
  });
});
