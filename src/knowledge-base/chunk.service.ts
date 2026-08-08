import { Injectable, Logger } from '@nestjs/common';

export interface ChunkResult {
  documentId: string;
  chunkIndex: number;
  chunkText: string;
  estimatedTokens: number;
  characterCount: number;
}

interface TextBlock {
  type: 'heading' | 'code' | 'paragraph';
  text: string;
  tokens: number;
}

@Injectable()
export class ChunkService {
  private readonly logger = new Logger(ChunkService.name);

  private readonly CHUNK_SIZE_LIMIT = 600;
  private readonly OVERLAP_LIMIT = 100;

  /**
   * Estimates token count using a realistic English text approximation:
   * 1 word ≈ 1.3 tokens. Fallback to length / 4 for symbol-dense content.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    const cleanText = text.trim();
    if (cleanText.length === 0) return 0;

    const words = cleanText.split(/\s+/).filter(Boolean).length;
    const wordEstimate = Math.ceil(words * 1.3);
    const charEstimate = Math.ceil(cleanText.length / 4);

    return Math.max(wordEstimate, charEstimate);
  }

  /**
   * Split document text into chunks without splitting headings or code blocks.
   */
  chunkDocument(documentId: string, text: string): ChunkResult[] {
    if (!text || text.trim() === '') {
      return [];
    }

    this.logger.log(
      `Chunking document: ${documentId} (${text.length} characters)`,
    );
    const blocks = this.parseBlocks(text);
    const chunks: ChunkResult[] = [];

    let currentChunkBlocks: TextBlock[] = [];
    let currentChunkTokens = 0;
    let chunkIndex = 0;

    const saveChunk = () => {
      if (currentChunkBlocks.length === 0) return;

      const chunkText = currentChunkBlocks.map((b) => b.text).join('\n\n');
      chunks.push({
        documentId,
        chunkIndex,
        chunkText,
        estimatedTokens: currentChunkTokens,
        characterCount: chunkText.length,
      });

      chunkIndex++;
    };

    for (const block of blocks) {
      // If adding this block exceeds the limit, save current chunk and roll over
      if (
        currentChunkTokens + block.tokens > this.CHUNK_SIZE_LIMIT &&
        currentChunkBlocks.length > 0
      ) {
        saveChunk();

        // Calculate overlap blocks from the end of the saved chunk
        let overlapTokens = 0;
        const overlapBlocks: TextBlock[] = [];
        for (let i = currentChunkBlocks.length - 1; i >= 0; i--) {
          const b = currentChunkBlocks[i];
          if (overlapTokens + b.tokens <= this.OVERLAP_LIMIT) {
            overlapBlocks.unshift(b);
            overlapTokens += b.tokens;
          } else {
            break;
          }
        }

        // Start new chunk with overlap + current block
        currentChunkBlocks = [...overlapBlocks, block];
        currentChunkTokens = overlapTokens + block.tokens;
      } else {
        currentChunkBlocks.push(block);
        currentChunkTokens += block.tokens;
      }
    }

    // Save final chunk
    saveChunk();

    this.logger.log(
      `Successfully split document ${documentId} into ${chunks.length} chunks`,
    );
    return chunks;
  }

  /**
   * Parses text into logical blocks while avoiding split headings and code blocks.
   */
  private parseBlocks(text: string): TextBlock[] {
    const lines = text.split('\n');
    const blocks: TextBlock[] = [];

    let inCodeBlock = false;
    let currentCodeBlockLines: string[] = [];
    let currentParagraphLines: string[] = [];

    const pushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        const paragraphText = currentParagraphLines.join('\n').trim();
        if (paragraphText) {
          const tokens = this.estimateTokens(paragraphText);

          // Fallback: If a paragraph is larger than the chunk size limit, split it by sentence
          if (tokens > this.CHUNK_SIZE_LIMIT) {
            const sentences = paragraphText.split(/(?<=[.?!])\s+/);
            let tempParagraph: string[] = [];
            let tempTokens = 0;

            for (const sentence of sentences) {
              const sentenceTokens = this.estimateTokens(sentence);
              if (
                tempTokens + sentenceTokens > this.CHUNK_SIZE_LIMIT - 100 &&
                tempParagraph.length > 0
              ) {
                const partText = tempParagraph.join(' ');
                blocks.push({
                  type: 'paragraph',
                  text: partText,
                  tokens: tempTokens,
                });
                tempParagraph = [sentence];
                tempTokens = sentenceTokens;
              } else {
                tempParagraph.push(sentence);
                tempTokens += sentenceTokens;
              }
            }

            if (tempParagraph.length > 0) {
              const partText = tempParagraph.join(' ');
              blocks.push({
                type: 'paragraph',
                text: partText,
                tokens: tempTokens,
              });
            }
          } else {
            blocks.push({
              type: 'paragraph',
              text: paragraphText,
              tokens,
            });
          }
        }
        currentParagraphLines = [];
      }
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        if (!inCodeBlock) {
          pushParagraph();
          inCodeBlock = true;
          currentCodeBlockLines.push(line);
        } else {
          currentCodeBlockLines.push(line);
          const codeText = currentCodeBlockLines.join('\n');
          blocks.push({
            type: 'code',
            text: codeText,
            tokens: this.estimateTokens(codeText),
          });
          currentCodeBlockLines = [];
          inCodeBlock = false;
        }
      } else if (inCodeBlock) {
        currentCodeBlockLines.push(line);
      } else {
        if (trimmedLine.startsWith('#')) {
          pushParagraph();
          blocks.push({
            type: 'heading',
            text: trimmedLine,
            tokens: this.estimateTokens(trimmedLine),
          });
        } else if (trimmedLine === '') {
          pushParagraph();
        } else {
          currentParagraphLines.push(line);
        }
      }
    }

    if (inCodeBlock && currentCodeBlockLines.length > 0) {
      const codeText = currentCodeBlockLines.join('\n');
      blocks.push({
        type: 'code',
        text: codeText,
        tokens: this.estimateTokens(codeText),
      });
    } else {
      pushParagraph();
    }

    return blocks;
  }
}
