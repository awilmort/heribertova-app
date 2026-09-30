import {
  assignRecintoCoordinatorsRequestSchema,
  recintoListQuerySchema,
  recintoVotersQuerySchema,
  type AssignRecintoCoordinatorsRequest,
  type RecintoListQuery,
  type RecintoListResponse,
  type RecintoSummary,
  type RecintoVotersQuery,
  type RecintoVotersResponse,
} from '@heribertova/shared';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import {
  assignRecintoCoordinators,
  getRecintoSummary,
  listRecintoVoters,
  listRecintos,
} from './service';

const keyParamsSchema = z.object({ key: z.string().min(1) });

/**
 * `/mi-recinto` (plan 7.1): both routes are `authenticated`, not permission-gated — every role that
 * logs in has *some* recinto access (their own, a coordinator's scopes, or everything for a general
 * coordinator/superadmin); `assertRecintoInScope` (recintos/scope.ts) is what actually decides which
 * `:key` a given caller may read.
 */
export function createRecintoRoutes(): ApiRoute[] {
  return [
    {
      // Plan 7.2, `/recintos`: coverage metrics and coordinator assignment — restricted to the same
      // permission as the PUT below, unlike the two routes after it (which are scope-checked, not
      // permission-gated).
      method: 'get',
      path: '/recintos',
      access: 'recintos.assignCoordinator',
      handlers: [
        validate({ query: recintoListQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as RecintoListQuery;
          res.json((await listRecintos(query)) satisfies RecintoListResponse);
        },
      ],
    },
    {
      method: 'get',
      path: '/recintos/:key/summary',
      access: 'authenticated',
      handlers: [
        validate({ params: keyParamsSchema }),
        async (req, res) => {
          const { key } = req.params as z.infer<typeof keyParamsSchema>;
          res.json((await getRecintoSummary(actorOf(req), key)) satisfies RecintoSummary);
        },
      ],
    },
    {
      method: 'get',
      path: '/recintos/:key/voters',
      access: 'authenticated',
      handlers: [
        validate({ params: keyParamsSchema, query: recintoVotersQuerySchema }),
        async (req, res) => {
          const { key } = req.params as z.infer<typeof keyParamsSchema>;
          const query = req.query as unknown as RecintoVotersQuery;
          res.json(
            (await listRecintoVoters(actorOf(req), key, query)) satisfies RecintoVotersResponse,
          );
        },
      ],
    },
    {
      method: 'put',
      path: '/recintos/:key/coordinators',
      access: 'recintos.assignCoordinator',
      handlers: [
        validate({ params: keyParamsSchema, body: assignRecintoCoordinatorsRequestSchema }),
        async (req, res) => {
          const { key } = req.params as z.infer<typeof keyParamsSchema>;
          await assignRecintoCoordinators(
            actorOf(req),
            key,
            req.body as AssignRecintoCoordinatorsRequest,
          );
          res.status(204).end();
        },
      ],
    },
  ];
}
