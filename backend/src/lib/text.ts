/** Trims and turns every run of whitespace into one space ("  LICEO   JUAN " → "LICEO JUAN"). */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Apostrophe-like marks that sit inside names (D´OLEO, D'OLEO, D’OLEO) and are dropped outright. */
const APOSTROPHES = /[´'`’]/g;

/**
 * The accent-, case- and punctuation-insensitive form used for name search (`voters.searchName`)
 * and for keys: NFD, combining marks removed (Á → a, Ñ → n, Ü → u), apostrophes removed
 * (D´OLEO → doleo), any other non-alphanumeric character turned into a space, spaces collapsed,
 * lowercase. Search input must go through the same function so prefixes match.
 */
export function normalizeForSearch(text: string): string {
  const withoutMarks = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(APOSTROPHES, '')
    .toLowerCase();
  return collapseSpaces(withoutMarks.replace(/[^a-z0-9]+/g, ' '));
}

/** URL- and key-safe slug: the search form with spaces as dashes ("ESCUELA  BÁSICA" → "escuela-basica"). */
export function slugify(text: string): string {
  return normalizeForSearch(text).replace(/ /g, '-');
}

/** Escapes regex metacharacters so user input can be used as a literal in a `RegExp`. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
