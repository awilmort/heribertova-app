import { pipeline, type Readable } from 'node:stream';
import streamArray from 'stream-json/streamers/stream-array.js';

export interface JsonArrayItem {
  /** Zero-based position in the array. */
  index: number;
  value: unknown;
}

/**
 * Streams the elements of a top-level JSON array from a byte stream, in constant memory: only the
 * current element is ever assembled. Throws (through the iteration) on malformed JSON or when the
 * top level is not an array; errors of `source` propagate too.
 */
export async function* readJsonArray(source: Readable): AsyncGenerator<JsonArrayItem> {
  // pipeline() destroys every stage with the first error, so the iteration below throws it; the
  // callback has nothing left to do.
  const items = pipeline(source, streamArray.withParserAsStream(), () => {});
  for await (const item of items as AsyncIterable<{ key: number; value: unknown }>) {
    yield { index: item.key, value: item.value };
  }
}
