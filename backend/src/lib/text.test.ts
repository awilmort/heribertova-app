import { describe, expect, it } from 'vitest';
import { collapseSpaces, normalizeForSearch, slugify } from './text';

describe('collapseSpaces', () => {
  it('trims and collapses inner runs of whitespace', () => {
    expect(collapseSpaces('  LICEO   JUAN\tPABLO \n DUARTE ')).toBe('LICEO JUAN PABLO DUARTE');
  });

  it('leaves clean text unchanged', () => {
    expect(collapseSpaces('MARIA')).toBe('MARIA');
  });

  it('returns an empty string for blank input', () => {
    expect(collapseSpaces('   ')).toBe('');
  });
});

describe('normalizeForSearch', () => {
  it('removes accents, tildes and diaereses and lowercases', () => {
    expect(normalizeForSearch('JOSÉ ÁNGEL NÚÑEZ PEÑA GÜICHARDO')).toBe(
      'jose angel nunez pena guichardo',
    );
  });

  it('handles every accented capital found in the padrón', () => {
    expect(normalizeForSearch('ÁÉÍÓÚÜÑ')).toBe('aeiouun');
  });

  it('drops the stray ´ and other apostrophes inside names', () => {
    expect(normalizeForSearch('D´OLEO')).toBe('doleo');
    expect(normalizeForSearch("D'OLEO")).toBe('doleo');
    expect(normalizeForSearch('D’OLEO')).toBe('doleo');
    expect(normalizeForSearch('D`OLEO')).toBe('doleo');
  });

  it('turns other punctuation into spaces and collapses them', () => {
    expect(normalizeForSearch('  MARÍA-JOSÉ   DE LA  CRUZ. ')).toBe('maria jose de la cruz');
  });

  it('matches precomposed and decomposed input alike', () => {
    expect(normalizeForSearch('PEÑA')).toBe(normalizeForSearch('PEÑA'));
  });

  it('keeps digits', () => {
    expect(normalizeForSearch('ESCUELA 27 DE FEBRERO')).toBe('escuela 27 de febrero');
  });
});

describe('slugify', () => {
  it('joins the normalized words with dashes', () => {
    expect(slugify('ESCUELA PRIMARIA RURAL')).toBe('escuela-primaria-rural');
    expect(slugify(' VERÓN ')).toBe('veron');
  });

  it('yields the same slug for names that differ only in stray spaces', () => {
    expect(slugify('LICEO  SAN  MARTÍN ')).toBe(slugify('LICEO SAN MARTIN'));
  });

  it('never produces leading, trailing or double dashes', () => {
    expect(slugify(' - LA  OTRA BANDA - ')).toBe('la-otra-banda');
  });
});
