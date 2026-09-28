import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import { request } from '../test/http';
import { apiErrorBodySchema, healthResponseSchema } from '@heribertova/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, sameOriginHeaders } from '../test/app';
import { connectTestDatabase, useTestDatabase } from '../test/database';
import type { AppConfig, AppDependencies } from './app';
import { createLogger } from './lib/logger';

useTestDatabase();

/** External services are stood in: these tests exercise the app, not the emulator. */
function buildApp(config: Partial<AppConfig> = {}, dependencies: Partial<AppDependencies> = {}) {
  return buildTestApp({ config, dependencies });
}

describe('GET /api/health', () => {
  it('reports ok when MongoDB and S3 answer', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toEqual({ status: 'ok', mongo: 'up', s3: 'up' });
  });

  it('reports degraded with 503 when MongoDB is unreachable', async () => {
    await mongoose.disconnect();
    try {
      const res = await request(buildApp()).get('/api/health');
      expect(res.status).toBe(503);
      expect(healthResponseSchema.parse(res.body)).toEqual({
        status: 'degraded',
        mongo: 'down',
        s3: 'up',
      });
    } finally {
      await connectTestDatabase();
    }
  });

  it('reports degraded with 503 when S3 is unreachable', async () => {
    const pingS3 = vi.fn().mockResolvedValue(false);
    const res = await request(buildApp({}, { pingS3 })).get('/api/health');
    expect(res.status).toBe(503);
    expect(healthResponseSchema.parse(res.body)).toEqual({
      status: 'degraded',
      mongo: 'up',
      s3: 'down',
    });
    expect(pingS3).toHaveBeenCalledOnce();
  });
});

describe('error responses', () => {
  it('returns the API error shape for unknown routes', async () => {
    const res = await request(buildApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON bodies with INVALID_JSON', async () => {
    const res = await request(buildApp())
      .post('/api/health')
      .set(sameOriginHeaders)
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('INVALID_JSON');
  });

  it('rejects bodies over the size limit with PAYLOAD_TOO_LARGE', async () => {
    const res = await request(buildApp())
      .post('/api/health')
      .set(sameOriginHeaders)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('sends standard RateLimit headers', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['ratelimit']).toBeDefined();
  });

  it('answers 429 RATE_LIMITED once the limit is exceeded', async () => {
    const app = buildApp({ RATE_LIMIT_MAX: 2 });
    await request(app).get('/api/health');
    await request(app).get('/api/health');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(429);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('request logging', () => {
  function captureApp() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    return {
      app: buildTestApp({ logger: createLogger('info', stream) }),
      output: () => lines.join(''),
    };
  }

  it('masks cédulas in URLs and never logs cookies or authorization headers', async () => {
    const { app, output } = captureApp();
    await request(app)
      .get('/api/voters/00112345672')
      .set('Cookie', 'sid=super-secret-session')
      .set('Authorization', 'Bearer super-secret-token');

    const text = output();
    expect(text).toContain('001-*******-2');
    expect(text).not.toContain('00112345672');
    expect(text).not.toContain('super-secret-session');
    expect(text).not.toContain('super-secret-token');
  });

  it('echoes a safe incoming X-Request-Id and replaces an unsafe one', async () => {
    const app = buildApp();
    const kept = await request(app).get('/api/health').set('X-Request-Id', 'abc-123');
    expect(kept.headers['x-request-id']).toBe('abc-123');

    const replaced = await request(app).get('/api/health').set('X-Request-Id', 'bad id <script>');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
