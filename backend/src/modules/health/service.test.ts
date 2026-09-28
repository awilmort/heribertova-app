import { describe, expect, it } from 'vitest';
import { getHealth } from './service';

const up = () => Promise.resolve(true);
const down = () => Promise.resolve(false);

describe('getHealth', () => {
  it('is ok when every dependency is up', async () => {
    await expect(getHealth({ mongo: up, s3: up })).resolves.toEqual({
      status: 'ok',
      mongo: 'up',
      s3: 'up',
    });
  });

  it('is degraded when S3 is down', async () => {
    await expect(getHealth({ mongo: up, s3: down })).resolves.toEqual({
      status: 'degraded',
      mongo: 'up',
      s3: 'down',
    });
  });

  it('is degraded when MongoDB is down', async () => {
    await expect(getHealth({ mongo: down, s3: up })).resolves.toEqual({
      status: 'degraded',
      mongo: 'down',
      s3: 'up',
    });
  });

  it('reports each dependency independently when both are down', async () => {
    await expect(getHealth({ mongo: down, s3: down })).resolves.toEqual({
      status: 'degraded',
      mongo: 'down',
      s3: 'down',
    });
  });
});
