import { describe, expect, it } from 'vitest';
import {
  minPasswordLength,
  PASSWORD_MIN_LENGTH,
  passwordTooShortMessage,
  SUPERADMIN_PASSWORD_MIN_LENGTH,
} from './passwords';
import { ROLES } from './roles';

describe('minPasswordLength', () => {
  it('is 8 characters for every role that uses the default password', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    for (const role of ROLES.filter((r) => r !== 'superadmin')) {
      expect(minPasswordLength(role)).toBe(8);
    }
  });

  it('is 14 characters for the superadmin', () => {
    expect(SUPERADMIN_PASSWORD_MIN_LENGTH).toBe(14);
    expect(minPasswordLength('superadmin')).toBe(14);
  });
});

describe('passwordTooShortMessage', () => {
  it('names the minimum length in Spanish', () => {
    expect(passwordTooShortMessage(8)).toBe('La contraseña debe tener al menos 8 caracteres.');
  });
});
