import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy';

function directive(policy: string, name: string): string | undefined {
  return policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe('buildContentSecurityPolicy', () => {
  it('only allows scripts carrying the request nonce in production', () => {
    const policy = buildContentSecurityPolicy('abc123', false);
    expect(directive(policy, 'script-src')).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('forbids framing anything', () => {
    const policy = buildContentSecurityPolicy('n', false);
    expect(directive(policy, 'frame-src')).toBe("'none'");
  });

  it("adds 'unsafe-eval' only in development", () => {
    expect(directive(buildContentSecurityPolicy('n', true), 'script-src')).toContain(
      "'unsafe-eval'",
    );
    expect(buildContentSecurityPolicy('n', false)).not.toContain('unsafe-eval');
  });

  it('forbids framing, plugins and foreign form targets', () => {
    const policy = buildContentSecurityPolicy('n', false);
    expect(directive(policy, 'frame-ancestors')).toBe("'none'");
    expect(directive(policy, 'object-src')).toBe("'none'");
    expect(directive(policy, 'form-action')).toBe("'self'");
  });

  it('never allows inline scripts', () => {
    expect(directive(buildContentSecurityPolicy('n', true), 'script-src')).not.toContain(
      "'unsafe-inline'",
    );
  });
});
