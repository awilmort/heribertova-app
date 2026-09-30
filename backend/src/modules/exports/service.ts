import {
  formatCedula,
  type DocStatus,
  type ExportPeopleQuery,
  type LeadersQuery,
  type PersonLevel,
  type PersonStatus,
} from '@heribertova/shared';
import type { Response } from 'express';
import { campaignDate, startOfCampaignDay } from '../../lib/campaignDay';
import { AppError } from '../../lib/errors';
import { AuditLogModel } from '../audit/model';
import { audit, type Actor } from '../audit/service';
import { PersonModel, type VoterSnapshot } from '../people/model';
import { personFilter, PERSON_STATUS_LABELS } from '../people/service';
import { LEVEL_LABELS, listLeaders } from '../promotions/service';
import { RecintoModel } from '../recintos/model';
import { addWatermark, startXlsxResponse } from './xlsx';

const EXPORT_ACTIONS = ['export.people', 'export.recintos', 'export.leaders'] as const;

/** Hard cap on rows per export (plan 6.4), independent of how many rows match the filters: bounds
 * the worst-case memory and download size regardless of how the caller narrows their query. */
const MAX_EXPORT_ROWS = 50_000;

const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: 'sin fotos',
  partial: 'fotos incompletas',
  complete: 'fotos completas',
};

export interface ExportOptions {
  dailyQuota: number;
  now?: Date;
}

/** Exports made by `actor` since the campaign day began (plan 6.4's "rate-limited"), the same
 * daily-quota pattern `voters/lookup.ts` uses for padrón lookups. */
async function exportsToday(actor: Actor, now: Date): Promise<number> {
  return AuditLogModel.countDocuments({
    actorUserId: actor.user._id,
    action: { $in: EXPORT_ACTIONS },
    at: { $gte: startOfCampaignDay(now) },
  });
}

async function assertExportQuota(actor: Actor, quota: number, now: Date): Promise<void> {
  if ((await exportsToday(actor, now)) >= quota) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Alcanzó el límite de ${quota} exportaciones por día. Podrá exportar de nuevo mañana.`,
    );
  }
}

/** The exporter's own name, for the watermark row; falls back to their cédula if their person
 * record is somehow gone (it never should be — every login has one). */
async function exporterName(actor: Actor): Promise<string> {
  const person = await PersonModel.findById(actor.user.personId)
    .select({ 'voterSnapshot.fullName': 1 })
    .lean();
  return person?.voterSnapshot.fullName ?? actor.user.username;
}

type PersonExportRow = {
  cedula: string;
  nickname: string | null;
  phone: string;
  level: PersonLevel;
  status: PersonStatus | null;
  docStatus: DocStatus;
  createdAt: Date;
  voterSnapshot: Pick<VoterSnapshot, 'fullName' | 'recintoName' | 'sector'>;
};

/**
 * `GET /api/exports/people.xlsx` (plan 6.4): the same scope and filters `listPeople` uses (via the
 * shared `personFilter`), streamed to `.xlsx` rather than paginated JSON. Capped at
 * `MAX_EXPORT_ROWS`; rate-limited per day; every export is audited, found rows or not.
 */
export async function exportPeopleXlsx(
  actor: Actor,
  query: ExportPeopleQuery,
  res: Response,
  { dailyQuota, now = new Date() }: ExportOptions,
): Promise<void> {
  await assertExportQuota(actor, dailyQuota, now);

  const filter = await personFilter(actor.user, query);
  const exportedBy = await exporterName(actor);

  const workbook = startXlsxResponse(res, `miembros-${campaignDate(now)}.xlsx`);
  const sheet = workbook.addWorksheet('Miembros');
  addWatermark(sheet, exportedBy, now, [
    'Cédula',
    'Nombre',
    'Apodo',
    'Nivel',
    'Estado',
    'Recinto',
    'Sector',
    'Teléfono',
    'Documentos',
    'Registrado',
  ]);

  const cursor = PersonModel.find(filter)
    .select({
      cedula: 1,
      nickname: 1,
      phone: 1,
      level: 1,
      status: 1,
      docStatus: 1,
      createdAt: 1,
      'voterSnapshot.fullName': 1,
      'voterSnapshot.recintoName': 1,
      'voterSnapshot.sector': 1,
    })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean<PersonExportRow[]>()
    .cursor();

  let rowCount = 0;
  for await (const person of cursor) {
    rowCount += 1;
    sheet
      .addRow([
        formatCedula(person.cedula),
        person.voterSnapshot.fullName,
        person.nickname ?? '',
        LEVEL_LABELS[person.level],
        person.status ? PERSON_STATUS_LABELS[person.status] : '',
        person.voterSnapshot.recintoName,
        person.voterSnapshot.sector,
        person.phone,
        DOC_STATUS_LABELS[person.docStatus],
        person.createdAt.toISOString().slice(0, 10),
      ])
      .commit();
  }
  sheet.commit();
  await workbook.commit();

  await audit(
    actor,
    {
      action: 'export.people',
      entity: 'export',
      entityId: null,
      summary: `Exportó ${rowCount} miembro(s) a Excel.`,
    },
    null,
  );
}

interface RecintoCoverage {
  members: number;
  leaders: number;
  aspirants: number;
}

/**
 * `GET /api/exports/recintos.xlsx` (plan 6.4): coverage per recinto in the caller's scope. A
 * recinto coordinator sees only their assigned recintos; general coordinators and the superadmin
 * see every one (the same roles `reports.view` already grants).
 */
export async function exportRecintosXlsx(
  actor: Actor,
  res: Response,
  { dailyQuota, now = new Date() }: ExportOptions,
): Promise<void> {
  await assertExportQuota(actor, dailyQuota, now);

  const recintoFilter =
    actor.user.role === 'recinto_coordinator' ? { _id: { $in: actor.user.recintoScopes } } : {};
  const recintos = await RecintoModel.find(recintoFilter).sort({ sector: 1, name: 1 }).lean();
  const recintoKeys = recintos.map((recinto) => recinto._id);

  const counts = await PersonModel.aggregate<{
    _id: { recintoKey: string; level: PersonLevel };
    count: number;
  }>([
    { $match: { deletedAt: null, 'voterSnapshot.recintoKey': { $in: recintoKeys } } },
    {
      $group: {
        _id: { recintoKey: '$voterSnapshot.recintoKey', level: '$level' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byRecinto = new Map<string, RecintoCoverage>();
  for (const { _id, count } of counts) {
    const coverage = byRecinto.get(_id.recintoKey) ?? { members: 0, leaders: 0, aspirants: 0 };
    if (_id.level === 'team_leader') coverage.leaders += count;
    else if (_id.level === 'aspiring_leader') coverage.aspirants += count;
    else coverage.members += count;
    byRecinto.set(_id.recintoKey, coverage);
  }

  const exportedBy = await exporterName(actor);
  const workbook = startXlsxResponse(res, `recintos-${campaignDate(now)}.xlsx`);
  const sheet = workbook.addWorksheet('Recintos');
  addWatermark(sheet, exportedBy, now, [
    'Recinto',
    'Sector',
    'Colegios',
    'Votantes',
    'Registrados',
    'Líderes',
    'Aspirantes',
    'Cobertura',
  ]);

  for (const recinto of recintos) {
    const coverage = byRecinto.get(recinto._id) ?? { members: 0, leaders: 0, aspirants: 0 };
    const registered = coverage.members + coverage.leaders + coverage.aspirants;
    const coverageShare = recinto.voterCount > 0 ? registered / recinto.voterCount : 0;
    sheet
      .addRow([
        recinto.name,
        recinto.sector,
        recinto.colegios.length,
        recinto.voterCount,
        registered,
        coverage.leaders,
        coverage.aspirants,
        `${(coverageShare * 100).toFixed(1)}%`,
      ])
      .commit();
  }
  sheet.commit();
  await workbook.commit();

  await audit(
    actor,
    {
      action: 'export.recintos',
      entity: 'export',
      entityId: null,
      summary: `Exportó ${recintos.length} recinto(s) a Excel.`,
    },
    null,
  );
}

/**
 * `GET /api/exports/leaders.xlsx` (plan 8.2, `/reportes`'s "leaders' progress" report): the same
 * scoped list `GET /api/leaders` shows on `/lideres`, with each leader's progress toward their goal
 * as its own column — the shape `exportPeopleXlsx` can't give this report, since `personSummary`
 * has no goal/progress fields.
 */
export async function exportLeadersXlsx(
  actor: Actor,
  query: LeadersQuery,
  res: Response,
  { dailyQuota, now = new Date() }: ExportOptions,
): Promise<void> {
  await assertExportQuota(actor, dailyQuota, now);

  const { items } = await listLeaders(actor, query);
  const exportedBy = await exporterName(actor);

  const workbook = startXlsxResponse(res, `lideres-${campaignDate(now)}.xlsx`);
  const sheet = workbook.addWorksheet('Líderes');
  addWatermark(sheet, exportedBy, now, [
    'Cédula',
    'Nombre',
    'Nivel',
    'Recinto',
    'Sector',
    'Miembros',
    'Meta',
    'Avance',
  ]);

  for (const leader of items) {
    const progress = leader.goal > 0 ? leader.memberCount / leader.goal : 0;
    sheet
      .addRow([
        formatCedula(leader.cedula),
        leader.fullName,
        LEVEL_LABELS[leader.level],
        leader.recintoName,
        leader.sector,
        leader.memberCount,
        leader.goal,
        `${Math.round(progress * 100)}%`,
      ])
      .commit();
  }
  sheet.commit();
  await workbook.commit();

  await audit(
    actor,
    {
      action: 'export.leaders',
      entity: 'export',
      entityId: null,
      summary: `Exportó ${items.length} líder(es)/aspirante(s) a Excel.`,
    },
    null,
  );
}
