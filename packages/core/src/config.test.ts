import { describe, expect, it } from 'vitest';
import { localSendingIsUnlimited } from './config';

describe('local unlimited sending', () => {
  it('requires an explicit development opt-in', () => {
    expect(localSendingIsUnlimited({ NODE_ENV: 'development', LOCAL_UNLIMITED_SENDING: true })).toBe(true);
    expect(localSendingIsUnlimited({ NODE_ENV: 'development' })).toBe(false);
  });
  it('never bypasses quotas in production or test environments', () => {
    expect(localSendingIsUnlimited({ NODE_ENV: 'production', LOCAL_UNLIMITED_SENDING: true })).toBe(false);
    expect(localSendingIsUnlimited({ NODE_ENV: 'test', LOCAL_UNLIMITED_SENDING: true })).toBe(false);
    expect(localSendingIsUnlimited({ LOCAL_UNLIMITED_SENDING: true })).toBe(false);
  });
});
