import { describe, expect, it } from 'vitest';
import { loginRedirectTarget } from './auth-gate';

describe('loginRedirectTarget', () => {
  it('sends an unauthenticated request to /login with where it was headed', () => {
    expect(loginRedirectTarget('/inicio', '', false)).toBe('/login?next=%2Finicio');
  });

  it('keeps the query string of the original request in `next`', () => {
    expect(loginRedirectTarget('/padron', '?q=abc', false)).toBe('/login?next=%2Fpadron%3Fq%3Dabc');
  });

  it('lets a request with a session cookie through', () => {
    expect(loginRedirectTarget('/inicio', '', true)).toBeNull();
  });

  it('never redirects the login page itself, cookie or not', () => {
    expect(loginRedirectTarget('/login', '', false)).toBeNull();
    expect(loginRedirectTarget('/login', '?next=/padron', false)).toBeNull();
  });

  it('never redirects the one-time superadmin setup page, cookie or not', () => {
    expect(loginRedirectTarget('/configuracion-inicial', '', false)).toBeNull();
  });
});
