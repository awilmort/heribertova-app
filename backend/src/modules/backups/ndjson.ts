import { EJSON } from 'bson';

/**
 * One MongoDB document per line, encoded with EJSON rather than plain JSON (plan 9.3): a document's
 * `ObjectId`s and `Date`s must come back as the same types on restore, not as plain strings, or every
 * reference and every date-based query on the restored data would silently break.
 */
export function encodeLine(doc: unknown): string {
  return `${EJSON.stringify(doc)}\n`;
}

/** The inverse of `encodeLine` for a whole dump: one document per non-empty line. */
export function decodeLines(ndjson: string): unknown[] {
  return ndjson
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => EJSON.parse(line) as unknown);
}
