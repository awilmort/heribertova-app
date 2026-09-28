import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { resetPasswordToDefault } from './service';

const userIdParamsSchema = z.object({ id: objectIdSchema });

export function createUserRoutes(): ApiRoute[] {
  return [
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
  ];
}
