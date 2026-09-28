import { afterAll, beforeAll } from 'vitest';
import { startTestServer, stopTestServer } from './http';

// Every backend test file serves its apps from one loopback server (see test/http.ts).
beforeAll(startTestServer);
afterAll(stopTestServer);
