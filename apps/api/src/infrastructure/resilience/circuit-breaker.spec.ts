import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from './circuit-breaker';
import { ServiceUnavailableError } from '../../common/errors/domain.errors';

/**
 * The breaker is the component that decides whether checkout stays up during a
 * vendor outage, so its state machine is tested directly rather than inferred.
 */
describe('CircuitBreaker', () => {
  const options = (overrides: Partial<CircuitBreakerOptions> = {}): CircuitBreakerOptions => ({
    name: 'test-dependency',
    failureThreshold: 3,
    rollingWindowMs: 1_000,
    timeoutMs: 100,
    resetTimeoutMs: 200,
    halfOpenSuccessThreshold: 2,
    halfOpenMaxAttempts: 2,
    ...overrides,
  });

  const failing = () => Promise.reject(new Error('upstream exploded'));
  const succeeding = <T>(value: T) => () => Promise.resolve(value);

  const drive = async (breaker: CircuitBreaker, times: number) => {
    for (let i = 0; i < times; i++) {
      await breaker.execute(failing).catch(() => undefined);
    }
  };

  it('starts closed and passes calls through', async () => {
    const breaker = new CircuitBreaker(options());

    await expect(breaker.execute(succeeding('ok'))).resolves.toBe('ok');
    expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);
  });

  it('stays closed while failures are below the threshold', async () => {
    const breaker = new CircuitBreaker(options());

    await drive(breaker, 2);

    expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);
    expect(breaker.getMetrics().failures).toBe(2);
  });

  it('opens once the failure threshold is reached', async () => {
    const breaker = new CircuitBreaker(options());

    await drive(breaker, 3);

    expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);
  });

  it('fails fast without invoking the dependency once open', async () => {
    const breaker = new CircuitBreaker(options());
    await drive(breaker, 3);

    const operation = jest.fn(succeeding('should not run'));
    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(ServiceUnavailableError);

    // This is the whole point: the dead dependency is never touched.
    expect(operation).not.toHaveBeenCalled();
  });

  it('runs the fallback instead of throwing when one is supplied', async () => {
    const breaker = new CircuitBreaker(options());
    await drive(breaker, 3);

    await expect(breaker.execute(failing, succeeding('degraded result'))).resolves.toBe(
      'degraded result',
    );
  });

  it('probes with half-open after the reset timeout, then closes on success', async () => {
    const breaker = new CircuitBreaker(options({ resetTimeoutMs: 50 }));
    await drive(breaker, 3);
    expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);

    await new Promise((resolve) => setTimeout(resolve, 60));

    // First trial call moves OPEN → HALF_OPEN and succeeds.
    await expect(breaker.execute(succeeding('recovered'))).resolves.toBe('recovered');
    expect(breaker.getMetrics().state).toBe(CircuitState.HALF_OPEN);

    // Second success meets halfOpenSuccessThreshold and closes the circuit.
    await breaker.execute(succeeding('recovered'));
    expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);
  });

  it('re-opens immediately if a half-open trial call fails', async () => {
    const breaker = new CircuitBreaker(options({ resetTimeoutMs: 50 }));
    await drive(breaker, 3);
    await new Promise((resolve) => setTimeout(resolve, 60));

    await breaker.execute(failing).catch(() => undefined);

    // One failed probe is enough — do not send real traffic at a sick service.
    expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);
  });

  it('counts a call that exceeds the timeout as a failure', async () => {
    const breaker = new CircuitBreaker(options({ timeoutMs: 30, failureThreshold: 1 }));

    const slow = () => new Promise((resolve) => setTimeout(() => resolve('too late'), 200));
    await expect(breaker.execute(slow)).rejects.toThrow(/timed out/);

    expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);
  });

  it('ages failures out of the rolling window', async () => {
    const breaker = new CircuitBreaker(options({ rollingWindowMs: 60 }));

    await drive(breaker, 2);
    expect(breaker.getMetrics().failures).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 80));

    // Old failures must not accumulate into a trip hours later.
    expect(breaker.getMetrics().failures).toBe(0);
    expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);
  });

  it('clears counted failures after a success while closed', async () => {
    const breaker = new CircuitBreaker(options());

    await drive(breaker, 2);
    await breaker.execute(succeeding('ok'));

    expect(breaker.getMetrics().failures).toBe(0);
  });

  it('can be reset manually for incident response', async () => {
    const breaker = new CircuitBreaker(options());
    await drive(breaker, 3);
    expect(breaker.getMetrics().state).toBe(CircuitState.OPEN);

    breaker.reset();

    expect(breaker.getMetrics().state).toBe(CircuitState.CLOSED);
  });
});
