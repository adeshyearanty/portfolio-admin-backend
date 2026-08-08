import { Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // failures before opening
  cooldownPeriod?: number; // ms to wait before half-open transition
}

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private nextTrialTime = 0;

  private readonly failureThreshold: number;
  private readonly cooldownPeriod: number;

  constructor(
    private readonly serviceName: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownPeriod = options.cooldownPeriod || 30000; // 30 seconds default
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();

    if (this.state === CircuitState.OPEN) {
      throw new Error(
        `Circuit breaker for "${this.serviceName}" is OPEN. Fast failing request.`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private checkState(): void {
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextTrialTime) {
      this.state = CircuitState.HALF_OPEN;
      this.logger.warn(
        `Transitioned circuit breaker for "${this.serviceName}" from OPEN to HALF_OPEN. Trialling next execution.`,
      );
    }
  }

  private onSuccess(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.logger.log(
        `Successfully reset circuit breaker for "${this.serviceName}" to CLOSED.`,
      );
    }
  }

  private onFailure(error: any): void {
    this.failureCount++;
    const errMsg = error instanceof Error ? error.message : String(error);

    this.logger.error(
      `Execution failure in "${this.serviceName}" (Count: ${this.failureCount}): ${errMsg}`,
    );

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.nextTrialTime = Date.now() + this.cooldownPeriod;
      this.logger.error(
        `Circuit breaker for "${this.serviceName}" transitioned to OPEN. Cooldown active until ${new Date(
          this.nextTrialTime,
        ).toISOString()}`,
      );
    }
  }

  getState(): CircuitState {
    this.checkState();
    return this.state;
  }
}
