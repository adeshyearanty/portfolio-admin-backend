import { CircuitBreaker, CircuitState } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('TestService', {
      failureThreshold: 2,
      cooldownPeriod: 50, // 50ms cooldown for fast test runs
    });
  });

  it('should start in CLOSED state and execute function successfully', async () => {
    const fn = jest.fn().mockResolvedValue('success-value');

    const result = await breaker.execute(fn);

    expect(result).toBe('success-value');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should open circuit when failures exceed threshold', async () => {
    const fnError = jest.fn().mockRejectedValue(new Error('API Error'));

    // 1. Trigger first failure
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    // 2. Trigger second failure (reaches threshold of 2)
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // 3. Subsequent calls should fail fast without executing the remote function
    const fnSuccess = jest.fn().mockResolvedValue('never-called');
    await expect(breaker.execute(fnSuccess)).rejects.toThrow(
      'Circuit breaker for "TestService" is OPEN. Fast failing request.',
    );
    expect(fnSuccess).not.toHaveBeenCalled();
  });

  it('should transition to HALF_OPEN after cooldown and reset to CLOSED on success', async () => {
    const fnError = jest.fn().mockRejectedValue(new Error('API Error'));

    // Force circuit to OPEN
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Wait for cooldown period (50ms)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next call should transition to HALF_OPEN and try to execute
    const fnSuccess = jest.fn().mockResolvedValue('recovered-value');
    const result = await breaker.execute(fnSuccess);

    expect(result).toBe('recovered-value');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(fnSuccess).toHaveBeenCalledTimes(1);
  });

  it('should transition back to OPEN if HALF_OPEN execution fails', async () => {
    const fnError = jest.fn().mockRejectedValue(new Error('API Error'));

    // Force circuit to OPEN
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    await expect(breaker.execute(fnError)).rejects.toThrow('API Error');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Wait for cooldown
    await new Promise((resolve) => setTimeout(resolve, 60));

    // HALF_OPEN execution fails
    const fnFailedTrial = jest
      .fn()
      .mockRejectedValue(new Error('Trial Failed'));
    await expect(breaker.execute(fnFailedTrial)).rejects.toThrow(
      'Trial Failed',
    );

    // Should be OPEN again immediately
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });
});
