import { z } from 'zod';
import { cedulaSchema } from '../cedula';
import { phoneSchema } from '../phone';
import { roleSchema } from '../roles';
import { booleanQueryParamSchema, pagedResponseSchema, paginationQuerySchema } from './pagination';

/**
 * Roles `POST /api/users` can create (plan 4.3). Team leaders and aspirants are never admin-appointed:
 * they come from the nomination flow (plan 6.1). Whether the caller may appoint `role` is a rank
 * check (`outranks`), not a further restriction of this list.
 */
export const APPOINTABLE_ROLES = ['general_coordinator', 'recinto_coordinator'] as const;
export const appointableRoleSchema = z.enum(APPOINTABLE_ROLES);
export type AppointableRole = z.infer<typeof appointableRoleSchema>;

/**
 * `POST /api/users`: appoints a coordinator from an existing voter (a member already, or not yet
 * one). `phone`/`phoneWhatsapp` are used only when the cédula has no `people` record yet, to create
 * one; an existing member keeps their own contact details, so the request need not carry them (the
 * server requires them itself when it turns out a new `people` record is needed).
 */
export const appointUserRequestSchema = z
  .object({
    cedula: cedulaSchema,
    role: appointableRoleSchema,
    recintoScopes: z.array(z.string()).default([]),
    phone: phoneSchema.optional(),
    phoneWhatsapp: z.boolean().optional(),
  })
  .refine((data) => (data.role === 'recinto_coordinator') === data.recintoScopes.length > 0, {
    message: 'Indique al menos un recinto para un coordinador de recinto.',
    path: ['recintoScopes'],
  });
export type AppointUserRequest = z.infer<typeof appointUserRequestSchema>;

export const appointUserResponseSchema = z.object({ id: z.string() });
export type AppointUserResponse = z.infer<typeof appointUserResponseSchema>;

/** `PATCH /api/users/:id`: activate/deactivate, and/or set a recinto coordinator's `recintoScopes`. */
export const updateUserRequestSchema = z
  .object({
    isActive: z.boolean().optional(),
    recintoScopes: z.array(z.string()).optional(),
  })
  .refine((data) => data.isActive !== undefined || data.recintoScopes !== undefined, {
    message: 'Debe indicar al menos un cambio.',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const userListQuerySchema = paginationQuerySchema.extend({
  role: roleSchema.optional(),
  isActive: booleanQueryParamSchema.optional(),
  usingDefaultPassword: booleanQueryParamSchema.optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

/** One row of `GET /api/users`, with the person's identity joined in for display. */
export const userSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  role: roleSchema,
  recintoScopes: z.array(z.string()),
  isActive: z.boolean(),
  usingDefaultPassword: z.boolean(),
  /** Whether `lockUntil` is still in the future. */
  locked: z.boolean(),
  lastLoginAt: z.string().nullable(),
  person: z.object({ fullName: z.string(), recintoName: z.string(), sector: z.string() }),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userListResponseSchema = pagedResponseSchema(userSummarySchema);
export type UserListResponse = z.infer<typeof userListResponseSchema>;
