import type { SectorsResponse } from '@heribertova/shared';
import { VoterImportModel } from '../imports/model';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from './model';

type SectorTree = SectorsResponse['sectors'];

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

/** Builds sector → recintos → colegios, with active voter counts, from `voters` and `recintos`. */
async function buildSectorTree(): Promise<SectorTree> {
  const [colegios, recintos] = await Promise.all([
    VoterModel.aggregate<{ _id: { recintoKey: string; colegioId: number }; voterCount: number }>([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: { recintoKey: '$recintoKey', colegioId: '$colegioId' },
          voterCount: { $sum: 1 },
        },
      },
    ]),
    RecintoModel.find().select({ name: 1, sector: 1 }).lean(),
  ]);

  const colegiosByRecinto = new Map<string, { id: number; voterCount: number }[]>();
  for (const { _id, voterCount } of colegios) {
    const list = colegiosByRecinto.get(_id.recintoKey) ?? [];
    list.push({ id: _id.colegioId, voterCount });
    colegiosByRecinto.set(_id.recintoKey, list);
  }

  const sectors = new Map<string, SectorTree[number]>();
  for (const recinto of recintos) {
    const recintoColegios = (colegiosByRecinto.get(recinto._id) ?? []).sort((a, b) => a.id - b.id);
    const voterCount = recintoColegios.reduce((sum, colegio) => sum + colegio.voterCount, 0);
    const sector = sectors.get(recinto.sector) ?? {
      name: recinto.sector,
      voterCount: 0,
      recintos: [],
    };
    sector.voterCount += voterCount;
    sector.recintos.push({
      key: recinto._id,
      name: recinto.name,
      voterCount,
      colegios: recintoColegios,
    });
    sectors.set(recinto.sector, sector);
  }

  return [...sectors.values()]
    .map((sector) => ({ ...sector, recintos: sector.recintos.sort(byName) }))
    .sort(byName);
}

/** Identifies the padrón in force: the last applied import (null before the first one). */
async function currentPadronVersion(): Promise<string | null> {
  const latest = await VoterImportModel.findOne({ status: 'applied' })
    .sort({ appliedAt: -1 })
    .select({ _id: 1 })
    .lean();
  return latest?._id.toHexString() ?? null;
}

/**
 * The sector tree, kept in memory until another import is applied. The padrón changes only through
 * an applied import, possibly from another process (the CLI), so each call compares the latest
 * applied import (a read of the small `voterImports` collection) instead of relying on being told.
 */
export function createSectorTreeCache(): () => Promise<SectorTree> {
  let cached: { version: string | null; tree: SectorTree } | null = null;
  return async function sectorTree(): Promise<SectorTree> {
    const version = await currentPadronVersion();
    if (cached?.version !== version) {
      cached = { version, tree: await buildSectorTree() };
    }
    return cached.tree;
  };
}
