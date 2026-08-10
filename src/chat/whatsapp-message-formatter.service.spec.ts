import { WhatsAppMessageFormatter } from './whatsapp-message-formatter.service';

describe('WhatsAppMessageFormatter', () => {
  let formatter: WhatsAppMessageFormatter;

  beforeEach(() => {
    formatter = new WhatsAppMessageFormatter();
  });

  it('should be defined', () => {
    expect(formatter).toBeDefined();
  });

  describe('bold text conversion', () => {
    it('should convert double asterisks **text** to single asterisks *text*', () => {
      const input = 'Adesh works with **React.js**, **NestJS**, and **TypeScript**.';
      const expected = 'Adesh works with *React.js*, *NestJS*, and *TypeScript*.';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should convert double underscores __text__ to single asterisks *text*', () => {
      const input = 'He is experienced with __Node.js__ and __MongoDB__.';
      const expected = 'He is experienced with *Node.js* and *MongoDB*.';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('nested bold and emphasis', () => {
    it('should convert ***text*** to *_text_*', () => {
      const input = 'This is ***very important*** note.';
      const expected = 'This is *_very important_* note.';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should convert ___text___ to *_text_*', () => {
      const input = 'This is ___highly critical___ detail.';
      const expected = 'This is *_highly critical_* detail.';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('bullet points', () => {
    it('should convert markdown asterisks * bullet to •', () => {
      const input = '* First item\n* Second item\n* Third item';
      const expected = '• First item\n• Second item\n• Third item';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should convert markdown hyphen - bullet to •', () => {
      const input = '- REST APIs\n- WebSockets\n- Microservices';
      const expected = '• REST APIs\n• WebSockets\n• Microservices';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should convert markdown plus + bullet to • and preserve indentation', () => {
      const input = '+ Main item\n  + Sub item';
      const expected = '• Main item\n  • Sub item';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('headings', () => {
    it('should convert markdown headings to bold text', () => {
      const input = '# Profile Overview\n\n## Technical Skills\n\n### Projects';
      const expected = '*Profile Overview*\n\n*Technical Skills*\n\n*Projects*';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should clean up headings that already contain markdown bold markers', () => {
      const input = '## **Backend Engineering** ⚙️';
      const expected = '*Backend Engineering ⚙️*';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('numbered lists', () => {
    it('should preserve numbered lists', () => {
      const input = '1. Design architecture\n2. Implement APIs\n3. Deploy to AWS';
      const expected = '1. Design architecture\n2. Implement APIs\n3. Deploy to AWS';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('emojis', () => {
    it('should preserve emojis and contextual formatting', () => {
      const input = '👋 Hey! Welcome 🚀\n\n💻 *Frontend*: React\n⚙️ *Backend*: NestJS';
      const expected = '👋 Hey! Welcome 🚀\n\n💻 *Frontend*: React\n⚙️ *Backend*: NestJS';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('paragraphs and spacing', () => {
    it('should collapse 3+ consecutive newlines to 2 and trim ends', () => {
      const input = '\n\nFirst paragraph.\n\n\n\nSecond paragraph.\n\n';
      const expected = 'First paragraph.\n\nSecond paragraph.';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('markdown links', () => {
    it('should convert markdown links [Label](url) to Label (url)', () => {
      const input = 'Check out [Adesh Portfolio](https://adesh.dev) for details.';
      const expected = 'Check out Adesh Portfolio (https://adesh.dev) for details.';
      expect(formatter.format(input)).toBe(expected);
    });

    it('should avoid repeating URL if label is the same as URL', () => {
      const input = 'Visit [https://adesh.dev](https://adesh.dev) to connect.';
      const expected = 'Visit https://adesh.dev to connect.';
      expect(formatter.format(input)).toBe(expected);
    });
  });

  describe('malformed markdown cases', () => {
    it('should properly format malformed bullet + bold combinations with colon', () => {
      const input =
        '* **Frontend Development: Adesh builds modern applications using **React.js**, **Next.js**, and **TypeScript**.\n' +
        '* **Backend Engineering: He is proficient in **Node.js**, **NestJS**, and **Express.js**.';

      const output = formatter.format(input);

      expect(output).toContain('• *Frontend Development:* Adesh builds modern applications using *React.js*, *Next.js*, and *TypeScript*.');
      expect(output).toContain('• *Backend Engineering:* He is proficient in *Node.js*, *NestJS*, and *Express.js*.');
      expect(output).not.toContain('**');
    });

    it('should properly format bullet + bold with closed double asterisks before colon', () => {
      const input = '* **Frontend Development:** Adesh builds applications.';
      const output = formatter.format(input);
      expect(output).toBe('• *Frontend Development:* Adesh builds applications.');
    });

    it('should handle multiple bold terms on consecutive lines without bleeding asterisks', () => {
      const input = '* **Databases: Adesh works with databases like\n**MongoDB** and **PostgreSQL**.';
      const output = formatter.format(input);
      expect(output).toContain('*MongoDB* and *PostgreSQL*.');
      expect(output).not.toContain('**');
    });
  });

  describe('already-correct WhatsApp formatting', () => {
    it('should preserve already valid WhatsApp bold, italic, and strikethrough', () => {
      const input =
        '*Frontend Development* 💻\n' +
        '• Works with *Node.js*, *NestJS*, and *Express.js*\n' +
        '• Uses _clean code_ and ~legacy patterns~';

      const output = formatter.format(input);
      expect(output).toBe(input);
    });
  });

  describe('mixed markdown documents', () => {
    it('should handle complex mixed markdown documents correctly', () => {
      const input = `
### 💻 Technical Stack Overview

Here is a summary of Adesh's expertise:

* **Frontend:**
  * **React.js** and **Next.js**
  * **TypeScript**
* **Backend:**
  * **NestJS** & **Node.js**

> Dedicated to building scalable cloud systems.

For more, visit [Portfolio](https://adesh.dev).
      `;

      const output = formatter.format(input);

      expect(output).toContain('*💻 Technical Stack Overview*');
      expect(output).toContain('• *Frontend:*');
      expect(output).toContain('• *React.js* and *Next.js*');
      expect(output).toContain('• *NestJS* & *Node.js*');
      expect(output).toContain('_Dedicated to building scalable cloud systems._');
      expect(output).toContain('Portfolio (https://adesh.dev)');
      expect(output).not.toContain('**');
      expect(output).not.toContain('###');
    });
  });
});
