import { describe, expect, it } from 'vitest';
import { isRetryableKdsError } from './kds-offline-sync';
import { ApiError } from './api-error';

describe('isRetryableKdsError', () => {
  it('queues failures where the server never judged the action', () => {
    expect(isRetryableKdsError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableKdsError(new ApiError('timeout', 408))).toBe(true);
    expect(isRetryableKdsError(new ApiError('boom', 500))).toBe(true);
    expect(isRetryableKdsError(new ApiError('bad gateway', 502))).toBe(true);
  });

  it('does not queue real rejections or an expired session', () => {
    expect(isRetryableKdsError(new ApiError('Order already cancelled', 409))).toBe(false);
    expect(isRetryableKdsError(new ApiError('Invalid status', 400))).toBe(false);
    expect(isRetryableKdsError(new ApiError('Not found', 404))).toBe(false);
    expect(isRetryableKdsError(new ApiError('Unauthorized', 401))).toBe(false);
  });
});
