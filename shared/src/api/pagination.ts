import { z } from 'zod';

/** The API's general list convention (HERIBERTO_ARCHITECTURE.md §9): `{ items, page, pageSize, total }`. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * A `true`/`false` query-string filter. `z.coerce.boolean()` is a trap here: it coerces with
 * `Boolean(value)`, so the *string* `"false"` (non-empty) comes out `true`. This only accepts the
 * two literal strings a `<select>` or a hand-built query string would send.
 */
export const booleanQueryParamSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/** A page of `item`s, with the query's page/pageSize echoed back and the total across every page. */
export function pagedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
