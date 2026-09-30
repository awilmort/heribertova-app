import { AppError } from '../../lib/errors';
import { RecintoModel } from './model';

/** Throws 400 VALIDATION_ERROR on `field` unless every key in `recintoKeys` is a real recinto. */
export async function assertKnownRecintos(recintoKeys: string[], field: string): Promise<void> {
  if (recintoKeys.length === 0) return;
  const count = await RecintoModel.countDocuments({ _id: { $in: recintoKeys } });
  if (count !== new Set(recintoKeys).size) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      [field]: ['Hay un recinto que no existe.'],
    });
  }
}
