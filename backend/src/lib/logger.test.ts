import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('info', stream), output: () => lines.join('') };
}

describe('createLogger', () => {
  it('redacts sensitive keys at the top level and nested', () => {
    const { logger, output } = captureLogger();
    logger.info({
      cedula: '00112345672',
      person: { phone: '8095551234', email: 'ana@example.com' },
      body: { credentials: { password: 'hunter2' } },
      req: { headers: { cookie: 'sid=abc', authorization: 'Bearer xyz' } },
    });
    const text = output();
    for (const secret of [
      '00112345672',
      '8095551234',
      'ana@example.com',
      'hunter2',
      'sid=abc',
      'Bearer xyz',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[REDACTED]');
  });

  it('keeps non-sensitive fields', () => {
    const { logger, output } = captureLogger();
    logger.info({ recinto: 'ESCUELA BASICA CABEZA DE TORO' }, 'hello');
    expect(output()).toContain('ESCUELA BASICA CABEZA DE TORO');
    expect(output()).toContain('hello');
  });
});
