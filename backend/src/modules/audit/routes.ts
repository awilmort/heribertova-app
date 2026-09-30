import {
  auditLogQuerySchema,
  type AuditLogQuery,
  type AuditLogResponse,
} from '@heribertova/shared';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { listAuditLog } from './listAuditLog';

export function createAuditRoutes(): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/audit',
      access: 'audit.view',
      handlers: [
        validate({ query: auditLogQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as AuditLogQuery;
          res.json((await listAuditLog(query)) satisfies AuditLogResponse);
        },
      ],
    },
  ];
}
