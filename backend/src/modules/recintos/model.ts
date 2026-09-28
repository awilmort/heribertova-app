import { model, Schema } from 'mongoose';

/**
 * A voting center (HERIBERTO_ARCHITECTURE.md §5), rebuilt from the voters on every applied import.
 * The file has no recinto code and names repeat across sectors, so the key is derived from both.
 */
export interface Recinto {
  /** slug(name) + "--" + slug(sector), e.g. "escuela-primaria-rural--juanillo". */
  _id: string;
  name: string;
  sector: string;
  /** `idColegio`s of the recinto, ascending. */
  colegios: number[];
  voterCount: number;
}

const recintoSchema = new Schema<Recinto>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    sector: { type: String, required: true },
    colegios: { type: [Number], required: true },
    voterCount: { type: Number, required: true },
  },
  { collection: 'recintos', versionKey: false },
);

recintoSchema.index({ sector: 1 });

export const RecintoModel = model<Recinto>('Recinto', recintoSchema);
