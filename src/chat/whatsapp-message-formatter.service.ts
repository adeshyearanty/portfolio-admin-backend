import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsAppMessageFormatter {
  /**
   * Normalize and format standard markdown text for WhatsApp Cloud API.
   *
   * Rules:
   * - Converts **bold** and __bold__ to *bold*
   * - Converts Markdown headings (#, ##, ###) into bold *Heading* lines
   * - Converts bullet markers (*, -, +) to unicode bullet '•'
   * - Resolves malformed combinations like "* **Title:** text" or "* **Title: text"
   * - Preserves numbered lists (1., 2., 3.)
   * - Converts Markdown links [Label](url) into clean "Label (url)" or "url"
   * - Preserves inline code (`code`) and normalizes code fences
   * - Preserves emojis, paragraphs, and clean line spacing
   * - Preserves already-valid WhatsApp formatting (*bold*, _italic_, ~strikethrough~)
   */
  format(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // 1. Normalize line endings
    let formatted = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Remove horizontal rules (---, ***, ___ on their own line)
    formatted = formatted.replace(/^\s*[-*_]{3,}\s*$/gm, '');

    // 3. Format markdown links [Label](url) -> "Label (url)" or "url"
    formatted = formatted.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_match, label: string, url: string) => {
        const cleanLabel = label.trim();
        const cleanUrl = url.trim();
        if (cleanLabel.toLowerCase() === cleanUrl.toLowerCase()) {
          return cleanUrl;
        }
        return `${cleanLabel} (${cleanUrl})`;
      },
    );

    // 4. Process line-by-line for headings, list markers, and malformed bullet-bold combinations
    const lines = formatted.split('\n');
    const processedLines = lines.map((line) => {
      let l = line.trimEnd();

      // Handle Markdown headings: e.g. "### 💻 Frontend Development" or "## **Backend Engineering** ⚙️"
      const headingMatch = l.match(/^(\s*)#{1,6}\s+(.+)$/);
      if (headingMatch) {
        const indent = headingMatch[1];
        let headingText = headingMatch[2].trim();
        // Strip inner bold and italic markers inside heading
        headingText = headingText
          .replace(/\*\*/g, '')
          .replace(/__/g, '')
          .replace(/^\*+|\*+$/g, '')
          .replace(/^_+|_+$/g, '')
          .trim();
        return `${indent}*${headingText}*`;
      }

      // Handle blockquotes: "> Quote" -> "_Quote_"
      const quoteMatch = l.match(/^(\s*)>\s+(.+)$/);
      if (quoteMatch) {
        const indent = quoteMatch[1];
        const quoteText = quoteMatch[2].trim();
        return `${indent}_${quoteText}_`;
      }

      // Handle bullet list items (*, -, +)
      const bulletMatch = l.match(/^(\s*)([*+-])\s+(.*)$/);
      if (bulletMatch) {
        const indent = bulletMatch[1];
        let content = bulletMatch[3].trim();

        // Handle bullet + bold title pattern:
        // E.g., "* **Frontend:**" or "* **Frontend**: text" or "* **React.js** and **Next.js**"
        const bulletBoldMatch = content.match(
          /^\*\*([^*\n:]+?):?\*\*(:?)\s*(.*)$/,
        );
        if (bulletBoldMatch) {
          let title = bulletBoldMatch[1].trim();
          const hasColon =
            content.startsWith(`**${title}:**`) ||
            content.startsWith(`**${title}**:`) ||
            bulletBoldMatch[2] === ':';
          const rest = bulletBoldMatch[3]?.trim();
          const colonStr = hasColon ? ':' : '';
          return rest
            ? `${indent}• *${title}${colonStr}* ${rest}`
            : `${indent}• *${title}${colonStr}*`;
        }

        // Malformed without closing ** before colon: e.g., "**Frontend Development: Adesh builds..."
        const malformedUnclosedBoldColon = content.match(
          /^\*\*([^*\n:]+):\s*(.*)$/,
        );
        if (malformedUnclosedBoldColon) {
          const title = malformedUnclosedBoldColon[1].trim();
          const rest = malformedUnclosedBoldColon[2]?.trim();
          return rest
            ? `${indent}• *${title}:* ${rest}`
            : `${indent}• *${title}:*`;
        }

        return `${indent}• ${content}`;
      }

      return l;
    });

    formatted = processedLines.join('\n');

    // 5. Normalize Bold and Italic Syntax
    // Bold + Italic: ***text*** or ___text___ -> *_text_*
    formatted = formatted.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '*_$1_*');
    formatted = formatted.replace(/___([^_\n]+?)___/g, '*_$1_*');

    // Standard Bold: **text** -> *text*
    formatted = formatted.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');

    // Standard Bold with underscores: __text__ -> *text*
    formatted = formatted.replace(/__([^_\n]+?)__/g, '*$1*');

    // 6. Clean up code fences (strip language tag: ```ts -> ```)
    formatted = formatted.replace(/^```[a-zA-Z0-9_-]+\s*$/gm, '```');

    // 7. Clean up accidental redundant bullet characters (e.g. "• • " or "• - ")
    formatted = formatted.replace(/^(\s*•\s+)[•*\-+]\s+/gm, '$1');

    // 8. Clean up stray double asterisks left by malformed markdown
    formatted = formatted.replace(/(^|\s)\*\*(\S)/g, '$1*$2');
    formatted = formatted.replace(/(\S)\*\*(\s|$)/g, '$1*$2');

    // 9. Normalize excessive blank lines (collapse 3+ newlines to 2)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
  }
}
