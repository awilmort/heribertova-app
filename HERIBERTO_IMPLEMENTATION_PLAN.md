# Heriberto — Implementation Plan

Status: ready for review (v3: Higüey scope; voter file format confirmed; brand assets in `brand/`)
Created: 2026-09-28 · Revised: 2026-09-28
Architecture reference: `HERIBERTO_ARCHITECTURE.md` (read it first; this is its phased execution). Functional reference: `LOE_FUNCTIONAL_ANALYSIS.md`.
Engineering principles: copy Banana's `AGENTS.md` into this repo verbatim (DRY, SOLID, YAGNI, "engineered enough", well-tested code is non-negotiable, no dead code, explicit over clever).

Each sub-phase is scoped to be completed as a single self-contained unit of work in one AI agent session. "Done when" defines completion; it is not a step-by-step recipe. Every sub-phase that adds behavior adds its tests: Vitest unit tests, Supertest + `mongodb-memory-server` (replica set) for integration, and Playwright where UI flows are named. A sub-phase is not done while typecheck, lint or tests are red.

---

## Locked-in decisions (do not re-litigate mid-implementation)

1. **Higüey only.** Only people in the uploaded Higüey voter data can be registered. There is no exterior/diaspora anywhere.
2. **No party-affiliation check**, and no affiliation field.
3. **MongoDB Atlas M0 + Mongoose.** Express 5 API on Render; Next.js 16 on Vercel, which calls the API through same-origin `/api` rewrites; AWS S3 for photos and backups; Turnstile on login. **No other paid or paid-tier services.** No Redis, no worker process, no SMS/email, no KYC, no LOE wrapper.
4. **Login = cédula + password; default password = birth date `DDMMYYYY`**, hashed with argon2id. Changing it is optional but encouraged with a skippable prompt and a banner. Forgotten passwords are reset by a coordinator or the superadmin back to the default.
5. **Only aspirants and above log in.** Plain members have no `users` document. There is no public registration of any kind.
6. **Exactly one superadmin** (the owner), created by CLI with a strong password + TOTP and guaranteed by a unique partial index. Only the superadmin can import voter data.
7. **Five login roles defined in code** (`shared/roles.ts` + `shared/permissions.ts`), not an editable permission table in the database.
8. **Promotion counts all registered, non-deleted members.** Thresholds are stored settings (defaults 2 / 8 / 20 / 1).
9. **Scope is enforced server-side** on every query and `:id` route.
10. **No real voter data in dev/test.** A synthetic Higüey generator is used instead.
11. **The voter file format is fixed:** a JSON array of flat objects exactly as documented in architecture §3.1 (`padron_higuey_mayo2024.json`: 181,551 voters, 110 recintos, 369 colegios, 80 sectors). CSV support is not built (YAGNI); it would be one more parser adapter if the export ever changes.
12. **Local first, deploy last.** Phases 1–9 are built and verified entirely on the developer machine:
    - docker-compose provides MongoDB and an S3-compatible emulator;
    - Cloudflare's public Turnstile test keys stand in for real ones;
    - the Next.js dev server rewrites `/api` to the local API.

    No cloud account (AWS, Atlas, Render, Vercel, domain) is needed until Phase 10. Git starts after 1.3, and the owner adds the GitHub remote.
13. **Voter data rules from the real file:**
    - `birthDate` is stored as the `"YYYY-MM-DD"` string, never a `Date`.
    - `recintoKey` = slug(recinto name) + "--" + slug(sector), because recinto names are not unique.
    - The cédula check digit is a warning only, since 87 real voters fail it.
    - There are no sex, recinto address or DM fields, and no feature may depend on them.
    - Names are searched through an accent-insensitive `searchName`.

---

## PHASE 0 — Inputs (owner tasks, run in parallel with Phase 1)

**0.1 Voter file sample: ✅ done (2026-09-28)**
`padron_higuey_mayo2024.json` was analyzed. The format, field map, anomalies and sizing are in architecture §3.1. **Owner action:** move the file out of the repository folder before `git init` (it contains real personal data); keep it only on your machine or in the prod imports bucket.

**0.2 Brand: ✅ done. Consent text: owner, open**
Logo, icons and color tokens are in `brand/` (`BRAND.md`). Consent texts are drafted in `docs/consent.md`: checkbox, short notice, and the full notice for `/privacidad`. **Owner action:** approve them and fill in the contact channel before 5.3 ships. 5.3 stores `consentAt`, `consentBy` and `consentVersion`, and adds a public `/privacidad` page.

---

## PHASE 1 — Foundation

**1.1 Repository scaffold**
npm workspaces `frontend/`, `backend/`, `shared/`; strict tsconfig bases; ESLint flat config + Prettier; Vitest; `docker-compose.dev.yml` (MongoDB 8, single-node replica set so transactions work locally); `.env.example` for each app with placeholders only; `.gitignore` covering `.env*`, `*.csv` key files, dumps and `padron_*.json`/`padron_*.csv`; `AGENTS.md`/`CLAUDE.md`; GitHub Actions `ci.yml` (install, typecheck, lint, test, build) on PRs.
Done when: `npm install && npm run dev` runs both apps against local Mongo; `npm run lint && npm run typecheck && npm test && npm run build` pass locally. `ci.yml` is written now and first runs when the remote exists (1.4).

**1.2 Backend skeleton**
Express 5 app factory `createApp()` (testable without listening). Config loaded and validated by zod at boot (fail fast). Mongoose connection with retry. `helmet` with strict defaults. `express-rate-limit` global limiter (memory store; single instance). `pino` logger with redaction of cédula, phone, email, password, cookie and token. Central error handler returning `{error:{code,message,fields}}`. zod `validate()` middleware. `GET /health` (liveness + Mongo ping). `trust proxy` configurable via env (off locally; set for Vercel → Render in 10.1). Module folder convention (`routes/service/model/schemas`). Test harness: `mongodb-memory-server` in replica-set mode plus a per-test DB reset.
Done when: tests cover health, 404, validation error shape, rate-limit headers, and that redacted fields never appear in log output.

**1.3 Frontend skeleton**
Next.js 16 App Router, React 19, Tailwind v4 + shadcn/ui themed from `brand/BRAND.md` tokens (AA contrast: `#5E4630` for small brown text), Poppins via `next/font/google`, logo from `brand/logo-horizontal.svg`, favicon, apple-touch and PWA icons from `brand/` wired into `app/` metadata and `manifest.ts`. Spanish UI strings in one `messages/es.ts` (no i18n library; YAGNI). Route groups `(auth)` and `(app)`. App shell: sidebar on desktop, bottom/drawer nav on mobile, top bar with user menu. TanStack Query provider, toast system, error boundary. Typed `api` client using `shared` zod schemas. `next.config.ts` rewrites `/api/:path*` to `API_ORIGIN`. `proxy.ts` placeholder.
Done when: the shell renders correctly at 360 px and on desktop, and a Playwright smoke test loads `/login`.

**1.4 Local services + Git repository**
- **Local stand-ins for the cloud services:**
  - `docker-compose.dev.yml` gains an **S3-compatible emulator**: MinIO, or LocalStack/Adobe S3Mock if MinIO's free image is unavailable at implementation time. The backend only speaks the S3 API with a configurable `S3_ENDPOINT` + path-style addressing, so any of them works.
  - An init step creates the three local buckets (`media`, `backups`, `imports`) and allows `http://localhost:3000` for browser PUTs to `imports`.
  - `backend/scripts/s3-check.ts` (`npm run s3:check --workspace=backend`) puts, gets and deletes a test object.
  - `.env.example` files are completed with local values, including Cloudflare's **Turnstile test keys**: site `1x00000000000000000000AA` and secret `1x0000000000000000000000000000000AA`, which always pass.
  - A root `npm run dev:up` / `dev:down` starts and stops the local services.
- **Git:**
  - **Before `git init`, the owner moves `padron_higuey_mayo2024.json` out of the folder.** A pre-commit check (a simple script run by `lint-staged`/`simple-git-hooks`) refuses files matching `padron_*`, `*.env`, or AWS key CSVs.
  - `git init` on `main`, with a first commit of the docs, `brand/` and the scaffold from 1.1–1.3.
  - The owner creates the private GitHub repo and adds `origin`, then pushes. From then on, work goes through branches and PRs, and `ci.yml` runs on each PR.
  - `README.md` explains local setup in five commands.

Done when:
- a fresh clone plus `npm install && npm run dev:up && npm run dev` gives a working app at `http://localhost:3000` whose `/api/health` reports Mongo and S3 as OK;
- `s3:check` passes against the emulator;
- a test commit containing a `padron_*.json` file is rejected by the hook;
- after the owner adds the remote, the first PR shows green CI.

---

## PHASE 2 — Voter data (read side)

**2.1 Voter file parser, models and CLI import core**
- `voters`, `recintos` and `voterImports` Mongoose models (architecture §5).
- `shared/cedula.ts`: format, mask `000-0000000-3`, and a check digit that **warns** rather than blocks.
- `backend/src/modules/voters/voterFile.ts`: the zod schema of one raw record (§3.1) and a pure mapper to a `voters` document. It builds `fullName`, `searchName` (NFD, strip diacritics and `´`, collapse spaces), `recintoKey` (normalized name + sector slug), `birthDate` string plus `birthMonth`/`birthDay`, and `checkDigitValid`, and drops the constant province/municipality/circ fields into the import metadata.
- `VoterImportService`, the core reused by Phase 9:
  - stream-parse a JSON array (`stream-json`, constant memory);
  - validate each row;
  - batch insert (1,000 rows) into `voters_staging_{id}`;
  - compute the report: accepted, rejected with reasons, warnings, and a diff vs current `voters` (new, moved recinto/colegio, missing, recintos added/removed);
  - `apply()`: upsert, mark missing voters inactive, rebuild `recintos`, refresh member snapshots, drop staging, all idempotent by SHA-256.
- CLI `npm run voters:import --workspace=backend -- --file <path> [--dry-run] [--apply]`.
- `backend/scripts/fake-voter-file.ts` writes a synthetic file in **exactly the real JSON shape**, including the real anomalies: 21 % null `apellido2`, `´` and accented names, one recinto name repeated across 7 sectors, stray spaces, about 0.05 % bad check digits, and some voters over 100. Size is configurable: 20k for dev, 181,551 for load checks.

Done when:
- mapper unit tests cover every anomaly above, including a birth date that must not shift under `TZ=America/Santo_Domingo`;
- importing the 181,551-record synthetic file completes in under 3 minutes locally with memory under 300 MB, and re-importing is a no-op;
- the **owner runs `--dry-run` against the real file on their machine** (no DB writes) and the report shows **181,551 accepted, 0 rejected, 87 check-digit warnings, 110 recintos, 369 colegios, 80 sectors**.

**2.2 Voter lookup (Consulta de Padrón)**
`GET /api/voters/:cedula` (permission `voters.lookup`). The response is the padrón card for the fields we have: full name, age, birthday (day and month), sector, recinto, colegio, plus "ya es miembro / nivel / líder" when the caller's scope allows it. Also `GET /api/sectors` (cached tree sector → recintos → colegios with voter counts), used by filters across the app. Lookups are not audited (too frequent and routine for an audit trail entry each), but a daily per-user quota (setting, default 300, counted by its own small collection rather than the audit log) returns 429 when exceeded. Web page `/padron` has a cédula input with mask and a result card.
Done when: lookup works end to end; the quota blocks the 301st lookup; a Playwright test covers found and not-found.

---

## PHASE 3 — Authentication

**3.1 Users, sessions, login and logout**
`users` model (including the unique partial index that allows only one superadmin) and `sessions` model (TTL on `expiresAt`, only the token hash stored). `POST /api/auth/login`:
- Turnstile verified server-side;
- argon2id verification;
- per-account progressive lockout and a per-IP+username limiter;
- the same generic error message for every kind of failure;
- a `__Host-sid` cookie.

Also: `POST /api/auth/logout`, the `requireAuth` middleware (loads the session, the user must be active, sliding idle/absolute expiry, 12 h for superadmin), a CSRF guard (Origin + `X-Requested-With` on unsafe methods), and `GET /api/me`.
Done when: tests cover success, wrong password, lockout and unlock timing, Turnstile failure, expiry (idle and absolute), a deactivated user being rejected mid-session, and a cross-origin POST being rejected.

**3.2 Default birth-date passwords and password changes**
A `createLoginForPerson(person, role)` service sets `passwordHash = argon2(DDMMYYYY from voter birthDate)` and `usingDefaultPassword: true`. `PUT /api/me/password` requires the current password, at least 8 characters, and a value that is not the birth date; it revokes other sessions. `POST /api/users/:id/reset-password` (permission `users.resetPassword`, scope-checked) resets to the default, unlocks the account, revokes sessions and is audited.
Done when: a nominated or appointed user can log in with their birth date; after a reset the old password fails and the birth date works; tests cover the scope checks on reset.

**3.3 Superadmin bootstrap + TOTP**
`backend/scripts/create-superadmin.ts` refuses if one already exists, requires a strong password (≥ 14 characters, not the birth date), and enrolls TOTP (prints an otpauth URI/QR; the secret is stored encrypted with `TOTP_ENC_KEY`). Superadmin login requires a second step `POST /api/auth/totp/verify`.
Done when: a second superadmin cannot be created (script or DB); superadmin login without a valid TOTP code yields no usable session.

**3.4 Authentication UI**
Pages and components:
- `/login`: cédula mask, password show/hide, Turnstile, clear Spanish errors, and the text "¿Olvidó su contraseña? Contacte a su coordinador".
- TOTP step (superadmin only).
- The **skippable** "Le recomendamos cambiar su contraseña" dialog after the first login with the default password, plus a persistent banner while `usingDefaultPassword` is true.
- `/perfil`: my data and change password.
- `proxy.ts` redirects to `/login?next=` when there is no session cookie.

Done when: a Playwright test covers login with the default password → dialog skipped → banner visible → change password → banner gone, as well as logout; the pages are keyboard-accessible and usable at 360 px.

---

## PHASE 4 — Authorization and user administration

**4.1 Roles, permissions and scope enforcement**
`shared/roles.ts` and `shared/permissions.ts` (the `ROLE_PERMISSIONS` map from architecture §8). Backend: `requirePermission(key)`, `scopeFilter(user)` (a Mongo filter by role: all / `recintoScopes` ∪ subtree / subtree), `assertInScope(user, person)`, and a `landingFor(role)` helper. `GET /api/me` returns permissions and the landing page. **An authorization matrix test** (role × every route × in/out of scope) is generated from a route registry, so any new route fails CI until it is added.
Done when: the matrix test passes, and a test proves that every registered route declares a permission.

**4.2 Permission-driven navigation**
Frontend: `usePermission`, a `<Can>` component, nav items filtered by permission, `/inicio` redirecting to the role's landing page, and a 403 page.
Done when: each role sees exactly its menu (Playwright, one user per role against seeded data).

**4.3 User administration + audit viewer**
`/admin/usuarios` (superadmin and general coordinator):
- list with filters (role, active, uses default password);
- appoint a coordinator from an existing voter or member (creates person if needed plus a login with the default password);
- set a recinto coordinator's `recintoScopes`;
- activate or deactivate;
- reset password;
- unlock.

A general coordinator cannot create, modify or reset the superadmin. `/admin/auditoria` (superadmin) offers filters and pagination. An `audit()` helper is used by every mutating service.
Done when: tests cover the appointment flow and the protections around the superadmin; a route-walking test asserts every mutating endpoint emits an audit entry.

---

## PHASE 5 — Members

**5.1 People model + registration policy + API**
`people` model (architecture §5, `ancestors` pattern). `RegistrationPolicy` (architecture §6.1): check digit → must be an **active Higüey voter** → not already registered → **no affiliation check** → required fields + consent. Endpoints:
- `POST /api/people/check` (eligibility + prefill);
- `POST /api/people` (transaction; honors an `Idempotency-Key` header for retries from flaky mobile connections);
- `GET /api/people` (scope = team | subtree | recinto; search by name, cédula or nickname; status and document filters; pagination);
- `GET/PATCH /api/people/:id`;
- `DELETE /api/people/:id` (soft delete with reason; blocked if the person has members).

Done when: policy unit tests cover every branch; integration tests cover scope, idempotent retries, duplicate cédulas under concurrency (the unique index holds), and the delete guard.

**5.2 Photos to S3**
`POST /api/people/:id/photos/:kind` (`cedula` | `selfie`, multer memory, ≤ 8 MB): check the bytes really are JPEG/PNG/HEIC → `sharp` re-encodes to JPEG (max 1600 px, quality 80, EXIF stripped) → `PutObject` to `people/{id}/{kind}-{uuid}.jpg` → delete the previous object → update `photos` and `docStatus`. `GET /api/people/:id/photos/:kind` redirects to a 5-minute presigned URL after the scope check. The S3 client sits behind a small `ObjectStorage` interface, with an in-memory fake for tests.
Done when: tests cover a renamed non-image being rejected, GPS EXIF being absent from the stored bytes, `docStatus` transitions, and an out-of-scope user getting 403.

**5.3 Registration UI (Registro de miembros / Mi equipo)**
`/equipo`:
- my members list with search, pagination and document badges ("Falta foto de cédula");
- the "Nuevo miembro" flow: cédula → check → prefilled name/recinto/colegio → contact fields with WhatsApp toggles → consent → camera/file capture of the cédula photo (required) and selfie (optional), with on-device compression and preview;
- a two-step save that recovers gracefully ("El miembro fue guardado; suba la foto nuevamente");
- edit and delete.

Done when: Playwright covers the happy path, "no figura en el padrón de Higüey", "ya está registrado", a failed photo upload followed by retry without duplicating the member, and the 360 px layout.

**5.4 Member validation by coordinators**
In the members list, for users with `people.validate`: a "Validar miembro" drawer to edit contact details and status (confirmed, excused, not contacted, deceased, resigned, sick, inactive), view and replace photos, and mark the member validated (`validatedBy/At`).
Done when: validation is scope-checked and audited, and status filters work in the list.

---

## PHASE 6 — Leadership pipeline (core mechanic)

**6.1 Promotion engine**
`settings` model (`promotion` doc, seeded with defaults 2 / 8 / 20 / 1) + `GET/PUT /api/settings/promotion` (superadmin, validated, audited). `leadershipEvents` model. `PromotionService`:
- **`nominate`**: one transaction that registers the ≥ 2 initial members, sets the nominee's level to `aspiring_leader`, calls `createLoginForPerson` (default password) and writes the event. It enforces the open-aspirant limit per nominator and the nominator's scope.
- **`onMemberCountChanged(leaderId)`**: hooked into member create and soft delete. It performs the conditional `updateOne` promotion at the threshold → updates `users.role`, writes the event, and flags sessions `permissionsStale`.
- **Manual promote and demote**, with a required reason.

Done when: a concurrency test (20 parallel registrations crossing the threshold) shows exactly one promotion and one event; the nomination rules are enforced; everything is audited.

**6.2 Leader dashboard + promotion celebration**
`GET /api/dashboards/leader`: my member count, progress to the threshold (aspirant) or to the goal (leader), aspirants I nominated and their progress, members missing photos, and members' birthdays this month. `/panel` shows KPI cards and a radial progress chart (red < 30 %, amber < 70 %, green ≥ 70 %). When `/me` reports `permissionsStale`, a celebration modal appears ("¡Felicidades! Ahora es Líder de Equipo"), `/me` is refetched and the nav changes, all without logging in again.
Done when: a Playwright test in which an aspirant registers the 8th member sees the celebration and the Team Leader navigation.

**6.3 Leaders and aspirants (Ptes. CB / APCB equivalent)**
`GET /api/leaders?level=` (scoped) and `/lideres`: leaders and aspirants with their counts, progress and teams (expandable), and a "Nominar aspirante" dialog. The dialog either picks an existing member or enters a cédula, and only enables confirmation once `nominationMinInitialMembers` members have been entered ("Registre N más para habilitar"). The client and server read the same settings.
Done when: a recinto coordinator can nominate only within scope; a team leader can nominate only from their own team or a new person; tests cover the rejection paths.

**6.4 Excel exports**
`GET /api/exports/people.xlsx` (the filters of `/equipo` and `/lideres`) and `GET /api/exports/recintos.xlsx`, streamed with `exceljs`. Exports are scope-limited, carry a header row with the user and timestamp, are capped at 50k rows, rate-limited, and audited. The pages get "Exportar Excel" buttons.
Done when: an export of 20k synthetic rows streams without memory spikes under 512 MB; a test asserts that out-of-scope rows are absent.

---

## PHASE 7 — Recintos

**7.1 Mi Recinto**
`GET /api/recintos/:key/summary` (voters, members, colegios, validated members, leaders) and `GET /api/recintos/:key/voters?filter=all|nonMembers&colegio=&q=&page=` (`q` is a prefix match on `searchName`, so "nunez" finds "NUÑEZ"). Team leaders and aspirants may only access their own recinto; coordinators may access their scopes. `/mi-recinto`: stats cards, a voter list with membership badges, a filter for voters who are not yet members, a colegio filter, a voter detail drawer (age, birthday, sector, colegio), and actions "Registrar como miembro" (opens the 5.3 flow prefilled) and "Nominar aspirante" (the 6.3 flow).
Done when: paging a 5k-voter recinto responds in under 200 ms on M0-equivalent data; the actions reuse the existing services with no duplicated logic.

**7.2 Recinto management + coordinator assignment**
`GET /api/recintos?sector=&withoutMembers=&q=` with coverage metrics per recinto (members, leaders, aspirants, share of voters) and `PUT /api/recintos/:key/coordinators`. `/recintos`: coverage table grouped by **sector** (80 sectors → 110 recintos) and sortable, a "sin miembros" filter, and assign/unassign coordinators (updates `recintoScopes`), with the change applying on the coordinator's next request.
Done when: assignment and unassignment immediately change what the coordinator can access (integration test); audited.

---

## PHASE 8 — Dashboards and reports

**8.1 General dashboard**
`GET /api/dashboards/general` (general coordinator and superadmin; recinto coordinators see their own scopes): totals, coverage by sector → recinto → colegio, leaders' progress distribution, teams at goal, recintos without members, registrations over time, members vs voters by **age band** (18–25, 26–35, 36–50, 51–65, 65+; the file has no sex field), and birthdays this month. Aggregation pipelines use indexes and cache results in memory for 60 s. `/panel/general` shows ECharts charts plus accessible tables that link to the relevant pages.
Done when: the dashboard responds in under 1.5 s on 181,551 synthetic voters and 30k members, and totals match the lists for the same filters (test).

**8.2 Reports**
`/reportes`: predefined filtered tables (members by sector/recinto/colegio, leaders' progress, members missing photos, members by status), each with Excel export via 6.4.
Done when: each report reconciles with the dashboard numbers (test).

---

## PHASE 9 — Voter import UI, backups and security review (local)

_The import core is built in 2.1; this phase adds the superadmin screen. Development uses synthetic files only; the real file is first imported in 10.2._

**9.1 Upload to storage + staged validation with progress**
`/admin/padron` (superadmin only; re-enters TOTP). The admin picks a `.json` file (≤ 150 MB) and a cut label (e.g. "mayo2024").
- The browser computes the SHA-256 (Web Crypto) and asks `POST /api/imports/upload-url`. A known hash is rejected as a duplicate.
- The browser **PUTs the file directly to the imports bucket** with a progress bar.
- `POST /api/imports {s3Key, cut, sha256}` creates the `voterImports` record and runs `VoterImportService` (2.1) **in-process, asynchronously**, streaming from S3 and reporting progress (rows processed) on the record. The UI polls `GET /api/imports/:id`, which in production also keeps Render awake.
- If the process restarts mid-import, the record is marked `failed` and its staging collection is dropped at next boot. The admin re-runs it.

The preview report shows totals, rejected rows (download `rejected.csv`), check-digit warnings, and the diff (new, moved recinto/colegio, missing, recintos added/removed) with examples.
Done when: e2e with a synthetic 181,551-record file works (upload → progress → report); memory on the API stays under 300 MB; a file with injected errors yields an accurate report; a restart mid-import leaves no orphan staging collection.

**9.2 Apply, discard, history**
- `POST /api/imports/:id/apply` (confirmation dialog shows the diff totals) calls `apply()` from 2.1.
- `DELETE /api/imports/:id` discards a staged import (drops staging, deletes the S3 object).
- `/admin/padron` lists the import history (cut, file, hash, counts, who, when, status).
- Members whose voter became `inactive` are flagged in the lists ("ya no figura en el padrón").

Done when: apply is idempotent; members of moved voters show the new recinto; discard leaves no staging collection or S3 object; everything is audited.

**9.3 Backups and restore** _(amended from the original plan: one manual backup, not a daily scheduled one — see below)_
- `POST /api/backups` (superadmin only, `backups.manage`) streams every collection except `sessions` as gzipped NDJSON to `S3_BACKUP_BUCKET/backup/`, with a manifest (counts, hashes). `GET /api/backups/status` returns the last backup's manifest and the database storage used.
- **Exactly one backup is kept.** Each run deletes the previous backup's objects only after every collection has dumped successfully, then writes the new ones, then writes the manifest last — so a failure partway through never destroys the previous backup and never leaves a partial one that a status check or restore would mistake for complete.
- **Manual only, triggered by the superadmin from `/admin/respaldos`.** There is no daily cron, no HMAC-signed unauthenticated endpoint and no `backup.yml` GitHub Actions workflow: the owner decided a single backup, made whenever they choose, is enough for this campaign's size. The admin widget shows the last backup's time and size, a "Crear respaldo ahora" button, and the database storage used (warns at 80 % of 512 MB).
- `backend/scripts/restore.ts --target-uri <uri>` restores the kept backup into a target database.

Done when: locally, a backup to the emulator restored (via `restore.ts`) into a fresh database reproduces the counts exactly; a non-superadmin is refused `POST /api/backups`.

**9.4 Security review (local)**
A checklist pass with evidence:
- headers and CSP;
- cookie flags;
- CSRF;
- rate limits and lockout tuning;
- the authorization matrix is complete;
- no PII in logs (sampled);
- dependency audit is clean;
- secrets scan of the git history;
- a data deletion script for people who ask to be removed (deletes the person and photos, keeps an anonymized audit entry; supports the "delete after the campaign" rule in `docs/consent.md`).

The cloud-side items (Atlas/S3/IAM least privilege) are verified in 10.1.
Done when: every item is marked pass or not-applicable with a note, and findings are fixed.

---

## PHASE 10 — Deployment and launch

**10.1 Cloud setup and first production deploy**
Follow `HERIBERTO_ARCHITECTURE.md` Appendix A for **prod** (a cloud dev/staging environment is optional and not planned): Atlas M0, S3 buckets + IAM + CORS, Render, Vercel, domain DNS for heribertova.do, a real Turnstile widget, and GitHub secrets. Set `trust proxy` for Vercel → Render. A temporary `whoami-ip` endpoint checks that the real client IP arrives through the Vercel rewrite, so per-IP rate limits work; remove it afterwards.
Done when:
- `https://heribertova.do/api/health` returns OK through Vercel → Render → Atlas;
- `s3:check` passes against prod with the least-privilege key;
- a presigned PUT from `https://heribertova.do` to the imports bucket succeeds (CORS);
- the client IP seen by the API matches the caller;
- a manually triggered `POST /api/backups` against prod lands in the backups bucket;
- the Atlas/S3/IAM least-privilege items from 9.4 are verified.

**10.2 Load sanity and go-live**
A k6 smoke test (login burst, 50 concurrent registrations, dashboards) against prod **before** the real data is loaded, with 181,551 synthetic voters; then wipe them. Then:
- create the superadmin in prod (strong password + TOTP) and seed prod settings;
- **initial real voter load** through `/admin/padron` (Phase 9);
- switch Render to **Starter** (or enable the UptimeRobot keep-alive) per architecture §13;
- go-live checklist: DNS, TLS, Turnstile, backups green, restore tested from a prod backup into a scratch database, `/privacidad` published with the approved texts.

Done when: p95 is within targets (lookups < 300 ms, registration < 800 ms excluding photo upload), and the owner signs off the checklist.

---

## Open items

1. **Approve `docs/consent.md`** and provide the contact channel for data requests (before 5.3 ships).
2. **Newer voter cut:** the file is the May 2024 cut, so new 18-year-olds are missing. Get a newer export from the same contact before the election and import it through Phase 9 (`/admin/padron`).
3. **Zone coordinators** above recinto coordinators: not planned; a recinto coordinator can hold several recintos. Sectors are available if zones are ever needed.
4. **Render Starter** (~US$7/mo) at launch vs a keep-alive ping on the free plan. Also whether to move to Vercel Pro, given the Hobby plan's non-commercial clause (architecture §13).
