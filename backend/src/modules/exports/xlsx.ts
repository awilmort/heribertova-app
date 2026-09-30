// Not `import * as ExcelJS`: exceljs's CJS build only synthesizes a `default` export under
// Node's ESM/CJS interop, so a namespace import leaves `ExcelJS.stream` (and everything else)
// undefined at runtime even though it typechecks — `tsx`/`node --run` hit this immediately.
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { CAMPAIGN_TIME_ZONE } from '../../lib/campaignDay';

const dateTimeFormat = new Intl.DateTimeFormat('es-DO', {
  timeZone: CAMPAIGN_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Starts a streaming `.xlsx` response (plan 6.4): constant memory regardless of row count, since
 * rows are written to `res` as they are added rather than held in memory as a whole workbook.
 */
export function startXlsxResponse(
  res: Response,
  filename: string,
): InstanceType<typeof ExcelJS.stream.xlsx.WorkbookWriter> {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
}

/** Every export's first rows (plan 6.4: "a header row with the user and timestamp"), then the
 * column header row itself. */
export function addWatermark(
  sheet: ExcelJS.Worksheet,
  exportedBy: string,
  at: Date,
  columns: readonly string[],
): void {
  sheet.addRow([`Exportado por ${exportedBy} el ${dateTimeFormat.format(at)}`]).commit();
  sheet.addRow([]).commit();
  sheet.addRow([...columns]).commit();
}
