import type { MeResponse } from '@heribertova/shared';
import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/requireAuth';
import { getMe } from './service';

export function createMeRouter(): Router {
  const router = Router();
  router.get('/me', requireAuth, async (req, res) => {
    res.json((await getMe(currentUser(req))) satisfies MeResponse);
  });
  return router;
}
