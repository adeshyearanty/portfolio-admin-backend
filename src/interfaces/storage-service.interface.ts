export interface IStorageService {
  saveFile(path: string, buffer: Buffer): Promise<string>;
  getFile(path: string): Promise<Buffer>;
  deleteFile(path: string): Promise<void>;
}

export const IStorageService = Symbol('IStorageService');
