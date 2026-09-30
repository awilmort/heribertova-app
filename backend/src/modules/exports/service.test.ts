import { PassThrough } from 'node:stream';
import { formatCedula } from '@heribertova/shared';
import type { Response } from 'express';
// See xlsx.ts: a namespace import leaves this undefined at runtime.
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { useTestDatabase } from '../../../test/database';
import { createTestPerson, createTestUser } from '../../../test/users';
import { PersonModel } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { exportLeadersXlsx, exportPeopleXlsx, exportRecintosXlsx } from './service';

useTestDatabase();

/** A writable `res` stand-in good enough for `startXlsxResponse` (it only calls `setHeader` and
 * pipes into the stream), plus a way to read back everything written to it. */
function captureXlsxResponse(): { res: Response; workbook: () => Promise<ExcelJS.Workbook> } {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve) => stream.on('end', resolve));
  const res = stream as unknown as Response;
  (res as unknown as { setHeader: (name: string, value: string) => void }).setHeader = () => {};
  return {
    res,
    workbook: async () => {
      await ended;
      const workbook = new ExcelJS.Workbook();
      // exceljs's own .d.ts shadows the name "Buffer" with `interface Buffer extends ArrayBuffer`
      // (its own file-local type, not Node's), which a real Buffer never structurally satisfies —
      // an upstream typing bug, not a mistake here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- see above
      await workbook.xlsx.load(Buffer.concat(chunks) as any);
      return workbook;
    },
  };
}

/** One column of every data row (after the watermark's two rows and the column-header row), 1-based
 * like `ExcelJS`'s own `getCell`. */
function columnValues(sheet: ExcelJS.Worksheet, column: number): string[] {
  const values: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      const value = row.getCell(column).value;
      if (typeof value === 'string') values.push(value);
    }
  });
  return values;
}

function firstColumn(sheet: ExcelJS.Worksheet): string[] {
  return columnValues(sheet, 1);
}

describe('exportPeopleXlsx', () => {
  it('includes only people in the caller scope', async () => {
    const leader = await createTestUser({ role: 'team_leader' });
    await createTestPerson({
      registeredBy: leader._id,
      ancestors: [leader.personId],
      cedula: '40200000101',
    });
    await createTestPerson({
      registeredBy: new Types.ObjectId(),
      ancestors: [],
      cedula: '40200000102',
    });

    const { res, workbook } = captureXlsxResponse();
    await exportPeopleXlsx({ user: leader, ip: null }, {}, res, { dailyQuota: 10 });

    const sheet = (await workbook()).worksheets[0];
    const cedulas = sheet ? firstColumn(sheet) : [];
    expect(cedulas).toContain(formatCedula('40200000101'));
    expect(cedulas).not.toContain(formatCedula('40200000102'));
  });

  it('is rate-limited per day and audits a successful export', async () => {
    const leader = await createTestUser({ role: 'team_leader' });

    const first = captureXlsxResponse();
    await exportPeopleXlsx({ user: leader, ip: null }, {}, first.res, { dailyQuota: 1 });
    await first.workbook();

    const second = captureXlsxResponse();
    await expect(
      exportPeopleXlsx({ user: leader, ip: null }, {}, second.res, { dailyQuota: 1 }),
    ).rejects.toThrow(AppError);
  });

  // Plan 8.2's "members missing photos" report exports through this same endpoint.
  it('filters by missingCedulaPhoto, the same as GET /api/people', async () => {
    const registrar = await createTestUser({ role: 'general_coordinator' });
    await PersonModel.updateOne(
      { _id: registrar.personId },
      { photos: { cedula: { key: 'registrar', uploadedAt: new Date() } } },
    );
    await createTestPerson({
      registeredBy: registrar._id,
      cedula: '40200000201',
      photos: { selfie: { key: 'has-selfie-only', uploadedAt: new Date() } },
    });
    await createTestPerson({
      registeredBy: registrar._id,
      cedula: '40200000202',
      photos: { cedula: { key: 'has-cedula-only', uploadedAt: new Date() } },
    });

    const { res, workbook } = captureXlsxResponse();
    await exportPeopleXlsx({ user: registrar, ip: null }, { missingCedulaPhoto: true }, res, {
      dailyQuota: 10,
    });

    const sheet = (await workbook()).worksheets[0];
    const cedulas = sheet ? firstColumn(sheet) : [];
    expect(cedulas).toEqual([formatCedula('40200000201')]);
  });
});

describe('exportLeadersXlsx', () => {
  it("includes each leader's progress and respects scope", async () => {
    const coordinator = await createTestUser({
      role: 'recinto_coordinator',
      recintoScopes: ['recinto-a'],
    });
    await createTestPerson({
      registeredBy: coordinator._id,
      cedula: '40200000301',
      level: 'team_leader',
      voterSnapshot: {
        fullName: 'IN SCOPE LEADER',
        recintoKey: 'recinto-a',
        recintoName: 'RECINTO A',
        colegioId: 1,
        sector: 'SECTOR A',
        birthDate: '1985-03-15',
      },
    });
    await createTestPerson({
      registeredBy: coordinator._id,
      cedula: '40200000302',
      level: 'team_leader',
      voterSnapshot: {
        fullName: 'OUT OF SCOPE LEADER',
        recintoKey: 'recinto-b',
        recintoName: 'RECINTO B',
        colegioId: 2,
        sector: 'SECTOR B',
        birthDate: '1985-03-15',
      },
    });

    const { res, workbook } = captureXlsxResponse();
    await exportLeadersXlsx({ user: coordinator, ip: null }, {}, res, { dailyQuota: 10 });

    const sheet = (await workbook()).worksheets[0];
    const names = sheet ? columnValues(sheet, 2) : [];
    expect(names).toContain('IN SCOPE LEADER');
    expect(names).not.toContain('OUT OF SCOPE LEADER');
  });
});

describe('exportRecintosXlsx', () => {
  it('limits a recinto coordinator to their assigned recintos', async () => {
    await RecintoModel.create({
      _id: 'recinto-a',
      name: 'RECINTO A',
      sector: 'SECTOR A',
      colegios: [1],
      voterCount: 100,
    });
    await RecintoModel.create({
      _id: 'recinto-b',
      name: 'RECINTO B',
      sector: 'SECTOR B',
      colegios: [2],
      voterCount: 200,
    });
    const coordinator = await createTestUser({
      role: 'recinto_coordinator',
      recintoScopes: ['recinto-a'],
    });

    const { res, workbook } = captureXlsxResponse();
    await exportRecintosXlsx({ user: coordinator, ip: null }, res, { dailyQuota: 10 });

    const sheet = (await workbook()).worksheets[0];
    const names = sheet ? firstColumn(sheet) : [];
    expect(names).toContain('RECINTO A');
    expect(names).not.toContain('RECINTO B');
  });
});
