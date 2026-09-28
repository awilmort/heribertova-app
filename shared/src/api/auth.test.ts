import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  meResponseSchema,
  totpRequiredResponseSchema,
  totpVerifyRequestSchema,
} from './auth';

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

describe('changePasswordRequestSchema', () => {
  const valid = { currentPassword: '15031985', newPassword: 'mi-clave-nueva' };

  it('accepts the current password and a new one of at least 8 characters', () => {
    expect(changePasswordRequestSchema.parse(valid)).toEqual(valid);
    expect(
      changePasswordRequestSchema.safeParse({ ...valid, newPassword: '12345678' }).success,
    ).toBe(true);
  });

  it('rejects a new password shorter than 8 characters, in Spanish', () => {
    const result = changePasswordRequestSchema.safeParse({ ...valid, newPassword: '1234567' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
    ]);
  });

  it('requires the current password', () => {
    expect(changePasswordRequestSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(
      false,
    );
    expect(changePasswordRequestSchema.safeParse({ newPassword: 'mi-clave-nueva' }).success).toBe(
      false,
    );
  });

  it('caps both passwords at 256 characters', () => {
    const long = 'x'.repeat(257);
    expect(changePasswordRequestSchema.safeParse({ ...valid, newPassword: long }).success).toBe(
      false,
    );
    expect(changePasswordRequestSchema.safeParse({ ...valid, currentPassword: long }).success).toBe(
      false,
    );
    expect(
      changePasswordRequestSchema.safeParse({ ...valid, newPassword: 'x'.repeat(256) }).success,
    ).toBe(true);
  });
});

describe('totpRequiredResponseSchema', () => {
  it('is exactly { totpRequired: true }', () => {
    expect(totpRequiredResponseSchema.parse({ totpRequired: true })).toEqual({
      totpRequired: true,
    });
    expect(totpRequiredResponseSchema.safeParse({ totpRequired: false }).success).toBe(false);
    expect(totpRequiredResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('totpVerifyRequestSchema', () => {
  it('accepts 6 digits, leading zeros included', () => {
    expect(totpVerifyRequestSchema.parse({ code: '012345' })).toEqual({ code: '012345' });
  });

  it.each(['', '12345', '1234567', '123 456', '12345a', ' 123456'])('rejects %j', (code) => {
    const result = totpVerifyRequestSchema.safeParse({ code });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Ingrese los 6 dígitos del código.');
  });

  it('rejects a missing or non-string code', () => {
    expect(totpVerifyRequestSchema.safeParse({}).success).toBe(false);
    expect(totpVerifyRequestSchema.safeParse({ code: 123456 }).success).toBe(false);
  });
});
