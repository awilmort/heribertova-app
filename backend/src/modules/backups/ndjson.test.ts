import { ObjectId } from 'bson';
import { describe, expect, it } from 'vitest';
import { decodeLines, encodeLine } from './ndjson';

describe('backups ndjson encode/decode', () => {
  it('round-trips ObjectId and Date without corrupting their types', () => {
    // Plain JSON.stringify/parse would turn these into a string and a plain object respectively —
    // a restore built on that would insert documents whose `_id` no longer matches any reference to
    // it, and whose dates no longer sort or query as dates. Only exercising a real restore would have
    // caught that, which is exactly the kind of mistake worth a test instead.
    const doc = { _id: new ObjectId(), when: new Date('2026-01-15T12:00:00.000Z'), n: 1 };

    const [restored] = decodeLines(encodeLine(doc)) as [typeof doc];

    expect(restored._id).toBeInstanceOf(ObjectId);
    expect(restored._id.equals(doc._id)).toBe(true);
    expect(restored.when).toBeInstanceOf(Date);
    expect(restored.when.getTime()).toBe(doc.when.getTime());
    expect(restored.n).toBe(1);
  });

  it('keeps each document on its own line and ignores a trailing newline', () => {
    const ndjson = encodeLine({ a: 1 }) + encodeLine({ a: 2 });
    expect(decodeLines(ndjson)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
