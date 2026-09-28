import { z } from 'zod';
import type { Logger } from '../../lib/logger';

/** Whether a Turnstile widget token is genuine. Never throws: any doubt is a failed check. */
export type TurnstileVerifier = (token: string, remoteIp: string | undefined) => Promise<boolean>;

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const TIMEOUT_MS = 5_000;

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).default([]),
});

/**
 * Verifies tokens with Cloudflare's siteverify API. Fails closed: a network error, a timeout or an
 * unexpected answer rejects the login. Locally the always-pass test secret is used.
 */
export function createTurnstileVerifier(
  secretKey: string,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): TurnstileVerifier {
  return async (token, remoteIp) => {
    const form = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    try {
      const res = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const result = siteverifyResponseSchema.parse(await res.json());
      if (!result.success) {
        logger.warn({ errorCodes: result['error-codes'] }, 'Turnstile rejected a token');
      }
      return result.success;
    } catch (err) {
      logger.warn({ err }, 'Turnstile verification failed');
      return false;
    }
  };
}
