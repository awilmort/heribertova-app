import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../lib/logger';
import { createTurnstileVerifier, TURNSTILE_SITEVERIFY_URL } from './turnstile';

function capturingLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('info', stream), output: () => lines.join('') };
}

function answering(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('createTurnstileVerifier', () => {
  it('posts the secret, the token and the client IP to siteverify', async () => {
    const fetchMock = answering({ success: true });
    const verify = createTurnstileVerifier('the-secret', createLogger('silent'), fetchMock);

    await expect(verify('widget-token', '203.0.113.7')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init?.method).toBe('POST');
    const form = init?.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({
      secret: 'the-secret',
      response: 'widget-token',
      remoteip: '203.0.113.7',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits remoteip when the client IP is unknown', async () => {
    const fetchMock = answering({ success: true });
    await createTurnstileVerifier('s', createLogger('silent'), fetchMock)('t', undefined);
    const form = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(form.has('remoteip')).toBe(false);
  });

  it('rejects a token Cloudflare refuses and logs the error codes, not the secret', async () => {
    const { logger, output } = capturingLogger();
    const verify = createTurnstileVerifier(
      'the-secret',
      logger,
      answering({ success: false, 'error-codes': ['invalid-input-response'] }),
    );

    await expect(verify('bad-token', undefined)).resolves.toBe(false);
    expect(output()).toContain('invalid-input-response');
    expect(output()).not.toContain('the-secret');
    expect(output()).not.toContain('bad-token');
  });

  it('fails closed when siteverify is unreachable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const verify = createTurnstileVerifier('s', createLogger('silent'), fetchMock);
    await expect(verify('t', undefined)).resolves.toBe(false);
  });

  it('fails closed on an unexpected answer (e.g. an HTML error page)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const verify = createTurnstileVerifier('s', createLogger('silent'), fetchMock);
    await expect(verify('t', undefined)).resolves.toBe(false);
  });

  it('fails closed when the answer lacks a boolean success', async () => {
    const verify = createTurnstileVerifier('s', createLogger('silent'), answering({ ok: 1 }));
    await expect(verify('t', undefined)).resolves.toBe(false);
  });
});
