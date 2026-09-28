import type { ErrorCode, FieldErrors } from '@heribertova/shared';

/** An error the API reports to the client as-is: HTTP status + code + user-facing (Spanish) message. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
