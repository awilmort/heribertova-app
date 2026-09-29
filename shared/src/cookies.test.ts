import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './cookies';

describe('SESSION_COOKIE', () => {
  it('uses the __Host- prefix, which forces Secure, Path=/ and no Domain', () => {
    expect(SESSION_COOKIE).toBe('__Host-sid');
    expect(SESSION_COOKIE.startsWith('__Host-')).toBe(true);
  });
});
