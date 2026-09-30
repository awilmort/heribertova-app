import {
  exportPeopleQuerySchema,
  leadersQuerySchema,
  type ExportPeopleQuery,
  type LeadersQuery,
} from '@heribertova/shared';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import {
  exportLeadersXlsx,
  exportPeopleXlsx,
  exportRecintosXlsx,
  type ExportOptions,
} from './service';

export interface ExportRoutesOptions {
  exportsDailyQuota: ExportOptions['dailyQuota'];
}

export function createExportRoutes({ exportsDailyQuota }: ExportRoutesOptions): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/exports/people.xlsx',
      access: 'people.export',
      handlers: [
        validate({ query: exportPeopleQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as ExportPeopleQuery;
          await exportPeopleXlsx(actorOf(req), query, res, { dailyQuota: exportsDailyQuota });
        },
      ],
    },
    {
      method: 'get',
      path: '/exports/recintos.xlsx',
      access: 'reports.view',
      handlers: [
        async (req, res) => {
          await exportRecintosXlsx(actorOf(req), res, { dailyQuota: exportsDailyQuota });
        },
      ],
    },
    {
      method: 'get',
      path: '/exports/leaders.xlsx',
      access: 'reports.view',
      handlers: [
        validate({ query: leadersQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as LeadersQuery;
          await exportLeadersXlsx(actorOf(req), query, res, { dailyQuota: exportsDailyQuota });
        },
      ],
    },
  ];
}
