import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockJwtService: jest.Mocked<JwtService>;
  let verifyAsyncMock: jest.Mock;

  beforeEach(() => {
    verifyAsyncMock = jest.fn();
    mockJwtService = {
      verifyAsync: verifyAsyncMock,
    } as unknown as jest.Mocked<JwtService>;

    guard = new JwtAuthGuard(mockJwtService);
  });

  const createMockContext = (authHeader?: string): ExecutionContext => {
    const request = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request with valid Bearer token', async () => {
    const payload = { id: 'user-1', role: 'admin' };
    verifyAsyncMock.mockResolvedValue(payload);

    const context = createMockContext('Bearer valid-token-123');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(verifyAsyncMock).toHaveBeenCalledWith('valid-token-123');
    const request = context.switchToHttp().getRequest<{ user: any }>();
    expect(request.user).toEqual(payload);
  });

  it('should throw UnauthorizedException when auth header is missing', async () => {
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing authentication token'),
    );
  });

  it('should throw UnauthorizedException when token type is not Bearer', async () => {
    const context = createMockContext('Basic admin:admin');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing authentication token'),
    );
  });

  it('should throw UnauthorizedException when token verification fails', async () => {
    verifyAsyncMock.mockRejectedValue(new Error('Invalid token'));

    const context = createMockContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired authentication token'),
    );
  });
});
