import {
  apiErrorBodySchema,
  setupStatusResponseSchema,
  type SetupSuperadminRequest,
} from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { request } from '../../../test/http';
import { buildTestApp, sameOriginHeaders } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestLogin, createTestPerson, createTestUser } from '../../../test/users';
import { UserModel } from '../users/model';

useTestDatabase();

const VALID: SetupSuperadminRequest = {
  cedula: '00100000001',
  fullName: 'JUAN PÉREZ',
  birthDate: '1985-03-15',
  phone: '8095551234',
  phoneWhatsapp: true,
  recintoName: 'LICEO CENTRO',
  sector: 'CENTRO',
  password: 'una frase larga y segura',
};

describe('GET /api/setup/status', () => {
  it('reports setup needed on a fresh database', async () => {
    const res = await request(buildTestApp()).get('/api/setup/status');
    expect(setupStatusResponseSchema.parse(res.body)).toEqual({ needed: true });
  });

  it('reports setup done once a superadmin exists, however it was created', async () => {
    const registrar = await createTestUser();
    const person = await createTestPerson({ registeredBy: registrar._id });
    await createTestLogin(person, { role: 'superadmin' });

    const res = await request(buildTestApp()).get('/api/setup/status');
    expect(setupStatusResponseSchema.parse(res.body)).toEqual({ needed: false });
  });
});

describe('POST /api/setup/superadmin', () => {
  it('creates the superadmin from the form details, no padrón import needed', async () => {
    const res = await request(buildTestApp())
      .post('/api/setup/superadmin')
      .set(sameOriginHeaders)
      .send(VALID);

    expect(res.status).toBe(204);
    await expect(
      UserModel.exists({ role: 'superadmin', username: VALID.cedula }),
    ).resolves.toBeTruthy();
  });

  it('refuses once a superadmin already exists', async () => {
    const app = buildTestApp();
    await request(app).post('/api/setup/superadmin').set(sameOriginHeaders).send(VALID);

    const res = await request(app)
      .post('/api/setup/superadmin')
      .set(sameOriginHeaders)
      .send({ ...VALID, cedula: '00100000002' });

    expect(res.status).toBe(403);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
    await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
  });

  it("rejects the operator's own birth date as a password field error", async () => {
    const res = await request(buildTestApp())
      .post('/api/setup/superadmin')
      .set(sameOriginHeaders)
      .send({ ...VALID, password: '15 / 03 / 1985' });

    expect(res.status).toBe(400);
    const { error } = apiErrorBodySchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields?.['body.password']?.[0]).toBe(
      'La nueva contraseña no puede ser su fecha de nacimiento.',
    );
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects a malformed request with field errors', async () => {
    const res = await request(buildTestApp())
      .post('/api/setup/superadmin')
      .set(sameOriginHeaders)
      .send({ ...VALID, cedula: '123', password: 'short' });

    expect(res.status).toBe(400);
    const { error } = apiErrorBodySchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['body.cedula', 'body.password']);
  });

  it('rejects a cross-origin request (CSRF guard)', async () => {
    const res = await request(buildTestApp())
      .post('/api/setup/superadmin')
      .set({ ...sameOriginHeaders, Origin: 'https://evil.example' })
      .send(VALID);

    expect(res.status).toBe(403);
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });
});
