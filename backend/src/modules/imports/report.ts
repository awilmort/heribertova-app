import type { Voter } from '../voters/model';
import type { StagedVoter, VoterFileSource } from '../voters/voterFile';

/** How many rejected rows and check-digit warnings the report keeps in full (the counts are exact). */
export const ROW_SAMPLE_LIMIT = 1_000;
/** How many example cédulas the report keeps per diff category (the counts are exact). */
export const DIFF_SAMPLE_LIMIT = 20;

export interface CountWithSamples<T = string> {
  count: number;
  samples: T[];
}

export interface RejectedRow {
  /** 1-based position of the record in the file's array. */
  row: number;
  /** The record's cédula when it has a string one, to help find it in the source. */
  cedula: string | null;
  reasons: string[];
}

/**
 * What a voter file would change, computed before anything is applied (HERIBERTO_ARCHITECTURE.md
 * §3.2 step 3). Diff categories compare against the current **active** voters; samples are cédulas.
 */
export interface VoterImportReport {
  rows: number;
  accepted: number;
  rejected: CountWithSamples<RejectedRow>;
  warnings: { checkDigit: CountWithSamples };
  totals: { recintos: number; colegios: number; sectors: number };
  diff: {
    /** In the file, not an active voter today (never seen, or inactive and coming back). */
    newVoters: CountWithSamples;
    movedRecinto: CountWithSamples;
    /** Same recinto, different colegio. */
    movedColegio: CountWithSamples;
    /** Active today, absent from the file: they become inactive on apply. */
    missing: CountWithSamples;
    recintosAdded: string[];
    recintosRemoved: string[];
  };
  /** The distinct values of the file's constant province/municipality/circ fields (normally one). */
  source: VoterFileSource[];
}

/** Where an active voter is today, for the diff. */
export type CurrentPlacement = Pick<Voter, 'recintoKey' | 'colegioId'>;

/** An exact count that remembers only its first `limit` samples. */
class SampledCount<T = string> {
  private count = 0;
  private readonly samples: T[] = [];

  constructor(private readonly limit: number) {}

  add(sample: T): void {
    this.count++;
    if (this.samples.length < this.limit) this.samples.push(sample);
  }

  get size(): number {
    return this.count;
  }

  toJSON(): CountWithSamples<T> {
    return { count: this.count, samples: [...this.samples] };
  }
}

/** Accumulates the report while the file streams by. Pure: the caller supplies the database facts. */
export class VoterImportReportBuilder {
  private readonly rejected = new SampledCount<RejectedRow>(ROW_SAMPLE_LIMIT);
  private readonly checkDigit = new SampledCount(ROW_SAMPLE_LIMIT);
  private readonly newVoters = new SampledCount(DIFF_SAMPLE_LIMIT);
  private readonly movedRecinto = new SampledCount(DIFF_SAMPLE_LIMIT);
  private readonly movedColegio = new SampledCount(DIFF_SAMPLE_LIMIT);
  private accepted = 0;
  private readonly recintos = new Set<string>();
  private readonly colegios = new Set<number>();
  private readonly sectors = new Set<string>();
  private readonly sources = new Map<string, VoterFileSource>();

  reject(rejectedRow: RejectedRow): void {
    this.rejected.add(rejectedRow);
  }

  /** Records an accepted voter; `current` is where the voter is today if active, else undefined. */
  accept(voter: StagedVoter, source: VoterFileSource, current: CurrentPlacement | undefined): void {
    this.accepted++;
    if (!voter.checkDigitValid) this.checkDigit.add(voter._id);
    this.recintos.add(voter.recintoKey);
    this.colegios.add(voter.colegioId);
    this.sectors.add(voter.sector);
    this.sources.set(JSON.stringify(source), source);

    if (!current) this.newVoters.add(voter._id);
    else if (current.recintoKey !== voter.recintoKey) this.movedRecinto.add(voter._id);
    else if (current.colegioId !== voter.colegioId) this.movedColegio.add(voter._id);
  }

  /**
   * @param missing active voters absent from the file
   * @param currentRecintoKeys the `recintos` that exist today
   */
  build(missing: CountWithSamples, currentRecintoKeys: readonly string[]): VoterImportReport {
    const current = new Set(currentRecintoKeys);
    return {
      rows: this.accepted + this.rejected.size,
      accepted: this.accepted,
      rejected: this.rejected.toJSON(),
      warnings: { checkDigit: this.checkDigit.toJSON() },
      totals: {
        recintos: this.recintos.size,
        colegios: this.colegios.size,
        sectors: this.sectors.size,
      },
      diff: {
        newVoters: this.newVoters.toJSON(),
        movedRecinto: this.movedRecinto.toJSON(),
        movedColegio: this.movedColegio.toJSON(),
        missing,
        recintosAdded: [...this.recintos].filter((key) => !current.has(key)).sort(),
        recintosRemoved: [...current].filter((key) => !this.recintos.has(key)).sort(),
      },
      source: [...this.sources.values()],
    };
  }
}

/** Collects an exact count of `items` with the first DIFF_SAMPLE_LIMIT as samples. */
export async function countWithSamples(items: AsyncIterable<string>): Promise<CountWithSamples> {
  const counter = new SampledCount(DIFF_SAMPLE_LIMIT);
  for await (const item of items) counter.add(item);
  return counter.toJSON();
}
