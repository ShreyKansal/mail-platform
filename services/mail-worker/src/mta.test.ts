import { describe, expect, it } from 'vitest';
import { backoffMs, classifySubmissionError } from './mta';

describe('MTA hand-off error classification', () => {
  it.each([
    [{ responseCode: 554, command: 'DATA' }, 'permanent'],
    [{ responseCode: 552, command: 'MAIL FROM' }, 'permanent'],
    [{ responseCode: 451, command: 'DATA' }, 'retry'],
    [{ responseCode: 421, command: 'CONN' }, 'retry'],
    [{ code: 'ECONNECTION', command: 'CONN' }, 'retry'],
    [{ code: 'ETIMEDOUT', command: 'CONN' }, 'retry'],
    [{ code: 'ESOCKET', command: 'RCPT TO' }, 'retry'],
    [{ code: 'ESOCKET', command: 'DATA' }, 'unknown'],
    [{ code: 'ETIMEDOUT' }, 'unknown'],
    [new Error('boom'), 'unknown'],
  ])('%j -> %s', (err, expected) => {
    expect(classifySubmissionError(err)).toBe(expected);
  });
});

describe('backoff', () => {
  it('grows exponentially, is jittered and capped', () => {
    expect(backoffMs(1, () => 0)).toBe(7_500);
    expect(backoffMs(1, () => 1)).toBe(15_000);
    expect(backoffMs(3, () => 1)).toBe(60_000);
    expect(backoffMs(50, () => 1)).toBe(30 * 60_000);
  });
});
