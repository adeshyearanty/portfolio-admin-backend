export interface ILlmService {
  generateResponse(
    prompt: string,
    options?: Record<string, any>,
  ): Promise<string>;
}

export const ILlmService = Symbol('ILlmService');
