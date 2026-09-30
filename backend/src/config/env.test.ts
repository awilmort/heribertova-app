import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const MONGODB_URI = 'mongodb://localhost:27017/heribertova';
const TOTP_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

/** The variables without a default: the minimum a valid environment must define. */
const required = {
  MONGODB_URI,
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_MEDIA_BUCKET: 'media',
  S3_IMPORTS_BUCKET: 'imports',
  S3_BACKUP_BUCKET: 'backups',
  APP_ORIGIN: 'http://localhost:3000',
  TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
  TOTP_ENC_KEY: TOTP_KEY_BASE64,
};

describe('loadEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(loadEnv(required)).toEqual({
      ...required,
      TOTP_ENC_KEY: Buffer.alloc(32, 7),
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 0,
      RATE_LIMIT_MAX: 300,
      RATE_LIMIT_WINDOW_MS: 900_000,
      LOGIN_RATE_LIMIT_MAX: 10,
      VOTER_LOOKUP_DAILY_QUOTA: 300,
      EXPORTS_DAILY_QUOTA: 50,
      AWS_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it('coerces numeric variables from strings', () => {
    const env = loadEnv({ ...required, PORT: '8080', TRUST_PROXY: '1', RATE_LIMIT_MAX: '10' });
    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.RATE_LIMIT_MAX).toBe(10);
  });

  it('accepts mongodb+srv URIs (Atlas)', () => {
    const uri = 'mongodb+srv://user:secret@cluster.example.mongodb.net/heribertova';
    expect(loadEnv({ ...required, MONGODB_URI: uri }).MONGODB_URI).toBe(uri);
  });

  it('fails when MONGODB_URI is missing', () => {
    expect(() => loadEnv({ ...required, MONGODB_URI: undefined })).toThrow(/MONGODB_URI/);
  });

  it('names every invalid variable without echoing its value', () => {
    const run = () => loadEnv({ ...required, MONGODB_URI: 'postgres://secret-value', PORT: 'abc' });
    expect(run).toThrow(/MONGODB_URI/);
    expect(run).toThrow(/PORT/);
    expect(run).not.toThrow(/secret-value/);
  });

  describe('object storage', () => {
    it('reads the local emulator settings', () => {
      const env = loadEnv({
        ...required,
        AWS_REGION: 'us-east-1',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_FORCE_PATH_STYLE: 'true',
      });
      expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
      expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    });

    it('leaves S3_ENDPOINT unset for AWS', () => {
      expect(loadEnv(required).S3_ENDPOINT).toBeUndefined();
    });

    it('parses S3_FORCE_PATH_STYLE as a boolean string, so "false" is false', () => {
      expect(loadEnv({ ...required, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(
        false,
      );
      expect(() => loadEnv({ ...required, S3_FORCE_PATH_STYLE: 'maybe' })).toThrow(
        /S3_FORCE_PATH_STYLE/,
      );
    });

    it('rejects an S3_ENDPOINT that is not an http(s) URL', () => {
      expect(() => loadEnv({ ...required, S3_ENDPOINT: 'localhost:9000' })).toThrow(/S3_ENDPOINT/);
      expect(() => loadEnv({ ...required, S3_ENDPOINT: 'ftp://localhost:9000' })).toThrow(
        /S3_ENDPOINT/,
      );
    });

    it.each([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'S3_MEDIA_BUCKET',
      'S3_IMPORTS_BUCKET',
      'S3_BACKUP_BUCKET',
    ] as const)('fails when %s is missing', (name) => {
      expect(() => loadEnv({ ...required, [name]: undefined })).toThrow(new RegExp(name));
    });

    it('never echoes the secret access key when the configuration is invalid', () => {
      const run = () =>
        loadEnv({ ...required, AWS_SECRET_ACCESS_KEY: 'super-secret-key', PORT: 'abc' });
      expect(run).toThrow(/PORT/);
      expect(run).not.toThrow(/super-secret-key/);
    });
  });

  describe('authentication', () => {
    it.each(['APP_ORIGIN', 'TURNSTILE_SECRET_KEY', 'TOTP_ENC_KEY'] as const)(
      'fails when %s is missing',
      (name) => {
        expect(() => loadEnv({ ...required, [name]: undefined })).toThrow(new RegExp(name));
      },
    );

    it('reduces APP_ORIGIN to its origin, so a trailing slash cannot break the Origin check', () => {
      expect(loadEnv({ ...required, APP_ORIGIN: 'https://heribertova.do/' }).APP_ORIGIN).toBe(
        'https://heribertova.do',
      );
    });

    it('rejects an APP_ORIGIN that is not an http(s) URL', () => {
      expect(() => loadEnv({ ...required, APP_ORIGIN: 'heribertova.do' })).toThrow(/APP_ORIGIN/);
    });

    it('coerces LOGIN_RATE_LIMIT_MAX', () => {
      expect(loadEnv({ ...required, LOGIN_RATE_LIMIT_MAX: '3' }).LOGIN_RATE_LIMIT_MAX).toBe(3);
    });

    it('coerces VOTER_LOOKUP_DAILY_QUOTA and rejects zero', () => {
      const env = loadEnv({ ...required, VOTER_LOOKUP_DAILY_QUOTA: '50' });
      expect(env.VOTER_LOOKUP_DAILY_QUOTA).toBe(50);
      expect(() => loadEnv({ ...required, VOTER_LOOKUP_DAILY_QUOTA: '0' })).toThrow(
        /VOTER_LOOKUP_DAILY_QUOTA/,
      );
    });

    it('coerces EXPORTS_DAILY_QUOTA and rejects zero', () => {
      const env = loadEnv({ ...required, EXPORTS_DAILY_QUOTA: '5' });
      expect(env.EXPORTS_DAILY_QUOTA).toBe(5);
      expect(() => loadEnv({ ...required, EXPORTS_DAILY_QUOTA: '0' })).toThrow(
        /EXPORTS_DAILY_QUOTA/,
      );
    });

    it('never echoes the Turnstile secret when the configuration is invalid', () => {
      const run = () =>
        loadEnv({ ...required, TURNSTILE_SECRET_KEY: 'turnstile-secret', PORT: 'x' });
      expect(run).toThrow(/PORT/);
      expect(run).not.toThrow(/turnstile-secret/);
    });

    it('decodes TOTP_ENC_KEY to its 32 bytes', () => {
      const key = Buffer.alloc(32, 0xab);
      expect(loadEnv({ ...required, TOTP_ENC_KEY: key.toString('base64') }).TOTP_ENC_KEY).toEqual(
        key,
      );
    });

    it.each([
      ['not base64', 'not base64!'],
      ['16 bytes', Buffer.alloc(16, 1).toString('base64')],
      ['33 bytes', Buffer.alloc(33, 1).toString('base64')],
    ])('rejects a TOTP_ENC_KEY that is %s, without echoing it', (_label, value) => {
      const run = () => loadEnv({ ...required, TOTP_ENC_KEY: value });
      expect(run).toThrow(/TOTP_ENC_KEY/);
      expect(run).not.toThrow(value);
    });
  });
});
