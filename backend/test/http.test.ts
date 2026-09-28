import { describe, expect, it } from 'vitest';
import { request } from './http';

describe('request (test/http)', () => {
  it('serves the app on 127.0.0.1, the address the request is sent to', async () => {
    const res = await request((req, res) => {
      res.end(JSON.stringify({ local: req.socket.localAddress, url: req.url }));
    }).get('/api/me?x=1');
    expect(JSON.parse(res.text)).toEqual({ local: '127.0.0.1', url: '/api/me?x=1' });
  });

  it('keeps apps apart, and reuses the prefix of an app it has seen', async () => {
    const first = (_req: unknown, res: { end: (body: string) => void }) => res.end('first');
    const second = (_req: unknown, res: { end: (body: string) => void }) => res.end('second');
    expect((await request(first).get('/')).text).toBe('first');
    expect((await request(second).get('/')).text).toBe('second');
    expect((await request(first).get('/')).text).toBe('first');
  });
});
