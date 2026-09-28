import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

export const notFound: RequestHandler = () => {
  throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado.');
};
