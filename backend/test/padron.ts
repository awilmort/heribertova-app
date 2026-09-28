import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { applyVoterImport, stageVoterFile } from '../src/modules/imports/service';
import type { RawVoterRecord } from '../src/modules/voters/voterFile';
import { generateFakeVoterRecords, voterFileChunks } from './fakeVoterFile';

/**
 * Imports a synthetic padrón the way the CLI does (plan 2.1: stage, then apply), so tests start
 * from the voters and recintos a real database would hold. Returns the imported records.
 */
export async function importFakePadron(voters: number): Promise<RawVoterRecord[]> {
  const records = [...generateFakeVoterRecords({ voters })];
  const text = [...voterFileChunks(records)].join('');
  const staged = await stageVoterFile({
    openFile: () => Readable.from([Buffer.from(text, 'utf8')]),
    sha256: createHash('sha256').update(text).digest('hex'),
    fileName: 'padron.json',
    cut: 'mayo2024',
  });
  await applyVoterImport(staged._id);
  return records;
}
