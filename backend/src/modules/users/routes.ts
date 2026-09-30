import {
  appointUserRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
  type AppointUserRequest,
  type AppointUserResponse,
  type UpdateUserRequest,
  type UserListQuery,
  type UserListResponse,
} from '@heribertova/shared';
import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { appointCoordinator } from './appoint';
import { listUsers } from './list';
import { resetPasswordToDefault, unlockUser, updateUser } from './service';

const userIdParamsSchema = z.object({ id: objectIdSchema });

export function createUserRoutes(): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/users',
      access: 'users.manage',
      handlers: [
        validate({ query: userListQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as UserListQuery;
          res.json((await listUsers(query)) satisfies UserListResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/users',
      access: 'users.manage',
      handlers: [
        validate({ body: appointUserRequestSchema }),
        async (req, res) => {
          const user = await appointCoordinator(actorOf(req), req.body as AppointUserRequest);
          res.status(201).json({ id: user.id } satisfies AppointUserResponse);
        },
      ],
    },
    {
      method: 'patch',
      path: '/users/:id',
      access: 'users.manage',
      handlers: [
        validate({ params: userIdParamsSchema, body: updateUserRequestSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof userIdParamsSchema>;
          await updateUser(actorOf(req), id, req.body as UpdateUserRequest);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/users/:id/reset-password',
      access: 'users.resetPassword',
      handlers: [
        validate({ params: userIdParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof userIdParamsSchema>;
          await resetPasswordToDefault(actorOf(req), id);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/users/:id/unlock',
      access: 'users.resetPassword',
      handlers: [
        validate({ params: userIdParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof userIdParamsSchema>;
          await unlockUser(actorOf(req), id);
          res.status(204).end();
        },
      ],
    },
  ];
}
