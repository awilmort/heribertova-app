import { describe, expect, it } from 'vitest';
import { isActivePath } from './navigation';

describe('isActivePath', () => {
  it('matches the exact path', () => {
    expect(isActivePath('/inicio', '/inicio')).toBe(true);
  });

  it('matches nested paths', () => {
    expect(isActivePath('/equipo/123', '/equipo')).toBe(true);
  });

  it('does not match a path that merely shares a prefix', () => {
    expect(isActivePath('/equipos', '/equipo')).toBe(false);
  });
});
