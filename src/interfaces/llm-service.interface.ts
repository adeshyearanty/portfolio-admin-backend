export interface ILlmService {
  generateAnswer(
    question: string,
    context: string,
    channel?: 'web' | 'whatsapp',
    systemInstruction?: string,
  ): Promise<string>;

  generateAnswerStream(
    question: string,
    context: string,
    channel?: 'web' | 'whatsapp',
    systemInstruction?: string,
  ): AsyncGenerator<string>;

  getSystemInstruction(channel?: 'web' | 'whatsapp'): string;
}

export const ILlmService = Symbol('ILlmService');

