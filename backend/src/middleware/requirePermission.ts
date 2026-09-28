import { hasPermission, type Permission } from '@heribertova/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { currentUser } from './requireAuth';

/** Admits only users whose role holds `permission` (403 FORBIDDEN otherwise). Runs after `requireAuth`. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!hasPermission(currentUser(req).role, permission)) {
      throw new AppError(403, 'FORBIDDEN', 'No tiene permiso para realizar esta acción.');
    }
    next();
  };
}
