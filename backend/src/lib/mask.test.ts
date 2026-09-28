import { describe, expect, it } from 'vitest';
import { maskCedulas } from './mask';

describe('maskCedulas', () => {
  it('masks an unformatted cédula', () => {
    expect(maskCedulas('/api/voters/00112345672')).toBe('/api/voters/001-*******-2');
  });

  it('masks a formatted cédula', () => {
    expect(maskCedulas('cedula=001-1234567-2')).toBe('cedula=001-*******-2');
  });

  it('masks every occurrence', () => {
    expect(maskCedulas('00112345672,40212345678')).toBe('001-*******-2,402-*******-8');
  });

  it('leaves shorter and longer digit runs untouched', () => {
    expect(maskCedulas('page=12345&id=123456789012')).toBe('page=12345&id=123456789012');
  });
});
