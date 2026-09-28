import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';

/**
 * HTTP for this project's tests: use `request(app)` from here, never `supertest` directly.
 *
 * Plain `supertest(app)` serves each app with `listen(0)`, which binds the IPv6 wildcard `::`, and
 * sends the request to 127.0.0.1. On macOS that wildcard socket may get a port another process
 * already holds on 127.0.0.1 (editors and helpers listen on ephemeral loopback ports), and the
 * request then reaches that process instead of the app: a random 404 from a stranger.
 *
 * Instead, each test file serves all its apps from one server bound to 127.0.0.1 itself, so the
 * kernel picks a port that is free on the very address requests go to. Binding to an address is
 * asynchronous, so the server starts before the tests (`test/setup.ts`). Each app gets a path
 * prefix, which the server strips before handing the request to the app.
 */

const PREFIX = '/__app/';
const PREFIXED_URL = /^\/__app\/(\d+)(\/.*)?$/;

const apps = new Map<string, RequestListener>();
const appIds = new WeakMap<RequestListener, string>();
let server: Server | null = null;
let baseUrl: string | null = null;

function dispatch(...[req, res]: Parameters<RequestListener>): void {
  const match = PREFIXED_URL.exec(req.url ?? '');
  const app = match?.[1] === undefined ? undefined : apps.get(match[1]);
  if (!match || !app) {
    res.writeHead(500).end(`No test app serves ${req.url}`);
    return;
  }
  req.url = match[2] ?? '/';
  void app(req, res);
}

/** Starts this test file's loopback server (test/setup.ts, before all tests). */
export async function startTestServer(): Promise<void> {
  const started = createServer(dispatch);
  await new Promise<void>((resolve, reject) => {
    started.once('error', reject);
    started.listen(0, '127.0.0.1', resolve);
  });
  server = started;
  baseUrl = `http://127.0.0.1:${(started.address() as AddressInfo).port}`;
}

/** Stops it (test/setup.ts, after all tests). */
export async function stopTestServer(): Promise<void> {
  const stopping = server;
  server = null;
  baseUrl = null;
  apps.clear();
  if (stopping) await new Promise((resolve) => stopping.close(resolve));
}

/** Supertest against `app`, served by this file's loopback server. */
export function request(app: RequestListener) {
  if (!baseUrl) throw new Error('The test HTTP server is not running (see test/setup.ts)');
  let id = appIds.get(app);
  if (!id) {
    id = String(apps.size + 1);
    apps.set(id, app);
    appIds.set(app, id);
  }
  return supertest(`${baseUrl}${PREFIX}${id}`);
}

// Keeps the `request.Response` / `request.Test` type names of supertest's default export.
// eslint-disable-next-line @typescript-eslint/no-namespace -- type-only mirror of supertest's namespace.
export declare namespace request {
  type Response = supertest.Response;
  type Test = supertest.Test;
}
