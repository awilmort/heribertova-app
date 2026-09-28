import type { MeResponse } from '@heribertova/shared';
import { currentUser } from '../../middleware/requireAuth';
import type { ApiRoute } from '../../routing/apiRoute';
import { getMe } from './service';

export function createMeRoutes(): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/me',
      access: 'authenticated',
      handlers: [
        async (req, res) => {
          res.json((await getMe(currentUser(req))) satisfies MeResponse);
        },
      ],
    },
  ];
}
