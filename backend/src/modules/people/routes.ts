import {
  checkPersonRequestSchema,
  createPersonRequestSchema,
  deletePersonRequestSchema,
  listPeopleQuerySchema,
  photoKindSchema,
  updatePersonRequestSchema,
  type CheckPersonRequest,
  type CheckPersonResponse,
  type CreatePersonRequest,
  type DeletePersonRequest,
  type ListPeopleQuery,
  type ListPeopleResponse,
  type PersonDetail,
  type UpdatePersonRequest,
} from '@heribertova/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { objectIdSchema } from '../../lib/objectId';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import type { ObjectStorage } from '../../storage/objectStorage';
import { actorOf } from '../audit/service';
import { checkEligibility } from './policy';
import {
  getPersonAvatarUrl,
  getPersonPhotoDownloadUrl,
  getPersonPhotoUrl,
  uploadPersonPhoto,
} from './photos';
import { deletePerson, getPerson, listPeople, registerPerson, updatePerson } from './service';

const personIdParamsSchema = z.object({ id: objectIdSchema });
const personPhotoParamsSchema = z.object({ id: objectIdSchema, kind: photoKindSchema });

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Parses a single `photo` field from a multipart body into memory (never disk), rejecting files
 * over 8 MB with the same error shape every other route uses. */
function uploadPhotoMiddleware(): RequestHandler {
  const single = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES },
  }).single('photo');
  return (req, res, next) => {
    single(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'La foto no puede superar 8 MB.'));
        return;
      }
      next(err);
    });
  };
}

export function createPeopleRoutes({
  objectStorage,
}: {
  objectStorage: ObjectStorage;
}): ApiRoute[] {
  return [
    {
      method: 'post',
      path: '/people/check',
      access: 'people.create',
      handlers: [
        validate({ body: checkPersonRequestSchema }),
        async (req, res) => {
          const { cedula } = req.body as CheckPersonRequest;
          res.json(
            (await checkEligibility(cedula, actorOf(req).user)) satisfies CheckPersonResponse,
          );
        },
      ],
    },
    {
      method: 'post',
      path: '/people',
      access: 'people.create',
      handlers: [
        validate({ body: createPersonRequestSchema }),
        async (req, res) => {
          const idempotencyKey = req.get('Idempotency-Key') ?? null;
          const person = await registerPerson(
            actorOf(req),
            req.body as CreatePersonRequest,
            idempotencyKey,
          );
          res.status(201).json(person satisfies PersonDetail);
        },
      ],
    },
    {
      method: 'get',
      path: '/people',
      access: 'authenticated',
      handlers: [
        validate({ query: listPeopleQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as ListPeopleQuery;
          res.json((await listPeople(actorOf(req), query)) satisfies ListPeopleResponse);
        },
      ],
    },
    {
      method: 'get',
      path: '/people/:id',
      access: 'authenticated',
      handlers: [
        validate({ params: personIdParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof personIdParamsSchema>;
          res.json((await getPerson(actorOf(req), id)) satisfies PersonDetail);
        },
      ],
    },
    {
      method: 'patch',
      path: '/people/:id',
      access: 'people.update',
      handlers: [
        validate({ params: personIdParamsSchema, body: updatePersonRequestSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof personIdParamsSchema>;
          const person = await updatePerson(actorOf(req), id, req.body as UpdatePersonRequest);
          res.json(person satisfies PersonDetail);
        },
      ],
    },
    {
      method: 'delete',
      path: '/people/:id',
      access: 'people.delete',
      handlers: [
        validate({ params: personIdParamsSchema, body: deletePersonRequestSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof personIdParamsSchema>;
          await deletePerson(actorOf(req), id, (req.body as DeletePersonRequest).reason);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/people/:id/photos/:kind',
      access: 'people.update',
      handlers: [
        validate({ params: personPhotoParamsSchema }),
        uploadPhotoMiddleware(),
        async (req, res) => {
          const { id, kind } = req.params as z.infer<typeof personPhotoParamsSchema>;
          if (!req.file) {
            throw new AppError(400, 'VALIDATION_ERROR', 'Debe adjuntar una foto.', {
              photo: ['Debe adjuntar una foto.'],
            });
          }
          const person = await uploadPersonPhoto(
            actorOf(req),
            id,
            kind,
            req.file.buffer,
            objectStorage,
          );
          res.json(person satisfies PersonDetail);
        },
      ],
    },
    {
      method: 'get',
      path: '/people/:id/photos/:kind',
      access: 'authenticated',
      handlers: [
        validate({ params: personPhotoParamsSchema }),
        async (req, res) => {
          const { id, kind } = req.params as z.infer<typeof personPhotoParamsSchema>;
          const url = await getPersonPhotoUrl(actorOf(req), id, kind, objectStorage);
          res.redirect(302, url);
        },
      ],
    },
    {
      method: 'get',
      path: '/people/:id/photos/:kind/download',
      access: 'people.downloadPhotos',
      handlers: [
        validate({ params: personPhotoParamsSchema }),
        async (req, res) => {
          const { id, kind } = req.params as z.infer<typeof personPhotoParamsSchema>;
          const url = await getPersonPhotoDownloadUrl(actorOf(req), id, kind, objectStorage);
          res.redirect(302, url);
        },
      ],
    },
    {
      method: 'get',
      path: '/people/:id/avatar',
      access: 'authenticated',
      handlers: [
        validate({ params: personIdParamsSchema }),
        async (req, res) => {
          const { id } = req.params as z.infer<typeof personIdParamsSchema>;
          const url = await getPersonAvatarUrl(actorOf(req), id, objectStorage);
          res.redirect(302, url);
        },
      ],
    },
  ];
}
