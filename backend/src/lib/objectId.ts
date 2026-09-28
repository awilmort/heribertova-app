import { z } from 'zod';

/** A MongoDB ObjectId in hex, as it appears in `:id` route params. */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Identificador no válido.');
