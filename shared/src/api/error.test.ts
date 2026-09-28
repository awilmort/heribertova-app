import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema } from './error';

describe('apiErrorBodySchema', () => {
  it('accepts an error with field messages', () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        fields: { 'body.phone': ['Requerido'] },
      },
    };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts an error without fields', () => {
    expect(
      apiErrorBodySchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success,
    ).toBe(true);
  });

  it('rejects unknown error codes', () => {
    expect(apiErrorBodySchema.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(
      false,
    );
  });

  it('rejects bodies that are not errors', () => {
    expect(apiErrorBodySchema.safeParse({ status: 'ok' }).success).toBe(false);
  });
});
