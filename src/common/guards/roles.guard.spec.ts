import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let mockReflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(mockReflector);
  });

  const createMockContext = (user?: {
    id: string;
    role?: string;
  }): ExecutionContext => {
    const request = { user };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request when no roles metadata is configured', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockContext({ id: 'user-1', role: 'guest' });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow request when user role matches metadata config', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['admin']);

    const context = createMockContext({ id: 'user-1', role: 'admin' });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when request has no user context', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['admin']);

    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Insufficient permissions: missing user role'),
    );
  });

  it('should throw ForbiddenException when user role does not match metadata config', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['admin']);

    const context = createMockContext({ id: 'user-1', role: 'guest' });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException(
        'Insufficient permissions: role "guest" does not have access',
      ),
    );
  });
});
