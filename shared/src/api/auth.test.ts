import { describe, expect, it } from 'vitest';
import { loginRequestSchema, meResponseSchema } from './auth';

const validLogin = { cedula: '00112345672', password: '15031985', turnstileToken: 'token' };

describe('loginRequestSchema', () => {
  it('accepts an unformatted cédula, a password and a Turnstile token', () => {
    expect(loginRequestSchema.parse(validLogin)).toEqual(validLogin);
  });

  it('rejects a formatted cédula (the client sends the 11 digits)', () => {
    expect(loginRequestSchema.safeParse({ ...validLogin, cedula: '001-1234567-2' }).success).toBe(
      false,
    );
  });

  it('requires a password and caps its length', () => {
    expect(loginRequestSchema.safeParse({ ...validLogin, password: '' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ ...validLogin, password: 'x'.repeat(256) }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ ...validLogin, password: 'x'.repeat(257) }).success).toBe(
      false,
    );
  });

  it('requires the Turnstile token', () => {
    expect(loginRequestSchema.safeParse({ ...validLogin, turnstileToken: '' }).success).toBe(false);
  });
});

describe('meResponseSchema', () => {
  const me = {
    user: { id: 'u1', username: '00112345672' },
    person: {
      id: 'p1',
      fullName: 'JUAN PÉREZ',
      nickname: null,
      recintoKey: 'liceo--centro',
      recintoName: 'LICEO',
      colegioId: 4675,
      sector: 'CENTRO',
    },
    role: 'team_leader',
    permissions: ['voters.lookup', 'people.create'],
    landing: '/panel',
    usingDefaultPassword: true,
  };

  it('accepts a logged-in user', () => {
    expect(meResponseSchema.parse(me)).toEqual(me);
  });

  it('rejects a role that cannot log in', () => {
    expect(meResponseSchema.safeParse({ ...me, role: 'member' }).success).toBe(false);
  });

  it('rejects an unknown permission', () => {
    expect(meResponseSchema.safeParse({ ...me, permissions: ['people.read'] }).success).toBe(false);
  });

  it('requires the landing page to be an app path', () => {
    expect(meResponseSchema.safeParse({ ...me, landing: 'panel' }).success).toBe(false);
  });
});
