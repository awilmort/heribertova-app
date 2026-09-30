import {
  changePasswordRequestSchema,
  type ChangePasswordRequest,
  type MeResponse,
} from '@heribertova/shared';
import { passwordChangeRateLimit } from '../../middleware/rateLimit';
import { currentUser } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { readSessionToken } from '../sessions/cookie';
import { consumePermissionsStale } from '../sessions/service';
import { changeOwnPassword } from '../users/service';
import { getMe } from './service';

export function createMeRoutes(): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/me',
      access: 'authenticated',
      handlers: [
        async (req, res) => {
          // requireAuth admitted the request, so it carries a session token.
          const token = readSessionToken(req);
          if (!token) throw new Error('Authenticated request without a session token');
          const permissionsStale = await consumePermissionsStale(token);
          res.json((await getMe(currentUser(req), permissionsStale)) satisfies MeResponse);
        },
      ],
    },
    {
      method: 'put',
      path: '/me/password',
      access: 'authenticated',
      handlers: [
        passwordChangeRateLimit(),
        validate({ body: changePasswordRequestSchema }),
        async (req, res) => {
          // requireAuth admitted the request, so it carries a session token.
          const token = readSessionToken(req);
          if (!token) throw new Error('Authenticated request without a session token');
          await changeOwnPassword(actorOf(req), req.body as ChangePasswordRequest, token);
          res.status(204).end();
        },
      ],
    },
  ];
}
