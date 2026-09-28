import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readJsonArray } from './jsonArray';

async function collect(source: Readable) {
  const items = [];
  for await (const item of readJsonArray(source)) items.push(item);
  return items;
}

/** A byte stream that delivers `text` in chunks of `size` bytes, splitting tokens and characters. */
function chunked(text: string, size: number): Readable {
  const bytes = Buffer.from(text, 'utf8');
  const chunks: Buffer[] = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size));
  return Readable.from(chunks);
}

describe('readJsonArray', () => {
  it('yields each element with its index', async () => {
    const items = await collect(chunked('[{"a":1},{"a":null},"x",[1,2]]', 1000));
    expect(items).toEqual([
      { index: 0, value: { a: 1 } },
      { index: 1, value: { a: null } },
      { index: 2, value: 'x' },
      { index: 3, value: [1, 2] },
    ]);
  });

  it('handles chunks that split tokens and multi-byte UTF-8 characters', async () => {
    const text = JSON.stringify([{ nombres: 'JOSÉ ÁNGEL', apellido1: 'D´OLEO NÚÑEZ' }]);
    const items = await collect(chunked(text, 3));
    expect(items).toEqual([
      { index: 0, value: { nombres: 'JOSÉ ÁNGEL', apellido1: 'D´OLEO NÚÑEZ' } },
    ]);
  });

  it('yields nothing for an empty array', async () => {
    expect(await collect(chunked(' [ ] ', 10))).toEqual([]);
  });

  it('throws on malformed JSON', async () => {
    await expect(collect(chunked('[{"a":1},{"a":', 10))).rejects.toThrow();
    await expect(collect(chunked('[{"a":1} {"a":2}]', 10))).rejects.toThrow();
  });

  it('throws when the top level is not an array', async () => {
    await expect(collect(chunked('{"a":1}', 10))).rejects.toThrow();
  });

  it('propagates errors from the source stream', async () => {
    const source = new Readable({
      read() {
        this.destroy(new Error('disk gone'));
      },
    });
    await expect(collect(source)).rejects.toThrow('disk gone');
  });
});
