# Heriberto — Architecture Design

Status: draft v3 (Higüey scope; voter data format confirmed from `padron_higuey_mayo2024.json`)
Created: 2026-09-28 · Revised: 2026-09-28
Inputs: `LOE_FUNCTIONAL_ANALYSIS.md` (the LOE behavior we replicate) and Banana Ranch `banana-web-app` (house stack: Next.js on Vercel, Express + Mongoose on Render, cookie auth, RBAC, AGENTS.md principles).
Companion: `HERIBERTO_IMPLEMENTATION_PLAN.md`.

---

## 1. Purpose and scope

**heribertova.do** is the organization platform for **Heriberto Santana's campaign for Alcalde of Higüey**. The campaign registers the voters who support him as **Members**. Some members become **Team Leaders**, who register and manage members under them once they meet the requirements. Coordinators follow progress by recinto and colegio electoral.

It replicates LOE's core mechanics (`LOE_FUNCTIONAL_ANALYSIS.md`) with these scope rules:

| Rule | Consequence |
|---|---|
| **Only Higüey voters** | Voter data covers the municipality of Higüey only: its recintos and colegios. Anyone not in the voter data cannot be registered. |
| **No affiliation filter** | Anyone who votes in Higüey can be registered, whatever party they belong to. The data has no affiliation field. |
| **Not public** | No self-registration and no public forms. People are added by users who have permission. |
| **Login is earned** | Plain members never log in. Aspiring leaders, team leaders and coordinators do. There is exactly one super admin (the project owner). |
| **Free first** | MongoDB Atlas M0, Vercel Hobby, Render Free, AWS S3 (photos only) and GitHub Actions. There is no paid SaaS. |
| **Out of scope** | Exterior/diaspora, identity verification/KYC, SMS/WhatsApp/email messaging, the LOE wrapper, the public sympathy form, onboarding quiz, incident center, and party-internal structures (CI/ETR/CVP/actas). |

---

## 2. Roles

UI text is Spanish (es-DO). Code is English.

| Role key | UI label | LOE equivalent | Logs in | How someone gets it |
|---|---|---|---|---|
| `superadmin` | Administrador | — | Yes (strong password + TOTP) | Exactly one user, created once from `/configuracion-inicial` at deploy time |
| `general_coordinator` | Coordinador General | Coordinador / Presidente | Yes | Appointed by superadmin |
| `recinto_coordinator` | Coordinador de Recinto | Presidente CI | Yes | Appointed by superadmin or a general coordinator; scoped to one or more recintos |
| `team_leader` | Líder de Equipo | Presidente CB | Yes | **Automatic** when an aspirant reaches the threshold (or manual promotion) |
| `aspiring_leader` | Aspirante a Líder | APCB | Yes | Nominated by a coordinator or a team leader |
| `member` | Miembro | Miembro CB | **No** | Registered by anyone above |

Every coordinator, leader and aspirant is also a member record (a voter registered in the system). A login account is a separate `users` document that exists only for roles that log in.

**Why roles live in code:** there are five fixed roles and one owner, so a permission table editable in the database (LOE's `PermisosLoe`, Banana's `Role` model) would be premature. A typed role→permissions map in `shared/` is enough and is simpler to test (YAGNI).

### 2.1 Promotion ladder (thresholds are stored settings; defaults from LOE)

```
Member ──(nominated with ≥ 2 initial members registered for them)──▶ Aspiring Leader  [login created]
Aspiring Leader ──(auto when registered members ≥ 8)──▶ Team Leader
Team Leader: goal 20 members; can nominate new Aspiring Leaders from their own team
```

**Counting rule:** all registered, non-deleted members count toward promotion, regardless of photo or document status.

---

## 3. Voter data

### 3.1 Source and confirmed format
A contact provides a **SQL view** with the Higüey voter records. The project owner uploads its export through the superadmin UI (plan Phase 9, `/admin/padron`); the same import core also runs as a CLI (Phase 2.1).

The format is **confirmed from the sample `padron_higuey_mayo2024.json` (padrón cut for the May 2024 elections)**:
- **a JSON array of flat objects**, UTF-8, 63 MB, **181,551 voters**;
- every record has the same 13 keys;
- no duplicate cédulas.

| Source key | Type | Observed | Maps to |
|---|---|---|---|
| `cedula` | string, 11 digits | 100 % present, unique; **87 (0.05 %) fail the mod-10 check digit** | `voters._id` |
| `nombres` | string, UPPERCASE | 1–5 words | `firstNames` |
| `apellido1` | string | always present | `lastName1` |
| `apellido2` | string \| **null** | **null in 21.5 %** | `lastName2` |
| `fechaNacimiento` | `"YYYY-MM-DD"` | 100 % valid; born 1901–2006 (all ≥ 18 at the 2024 cut; 84 records are over 100 years old) | `birthDate` (**kept as a string**), `birthMonth`, `birthDay` |
| `idProvincia` / `descripcionProvincia` | 2 / "LA ALTAGRACIA" | constant | import metadata only |
| `idMunicipio` / `descripcionMunicipio` | 28 / "HIGUEY" | constant | import metadata only |
| `codigoCircunscripcion` | "01" | constant | import metadata only |
| `descripcionRecinto` | string | **104 distinct names but 110 real recintos**: "ESCUELA PRIMARIA RURAL" is used in 7 different sectors; 2 names have stray spaces | part of `recintoKey` |
| `idColegio` | int (4675–17300) | 369 colegios; 5–615 voters each; each colegio belongs to exactly one recinto and one sector | `colegioId` |
| `descripcionSector` | string | 80 sectors, including the distritos municipales' areas (Verón, Bávaro, Punta Cana, La Otra Banda, Las Lagunas…) | `sector` |

**What the file does *not* have, and the design consequences:**
- **No sex/gender.** Demographics show **age bands only**. Sex is never inferred from names.
- **No recinto code or address.** We derive a stable key, `recintoKey = slug(normalize(descripcionRecinto)) + "--" + slug(normalize(descripcionSector))` (for example `escuela-primaria-rural--juanillo`), which yields exactly 110 recintos. Addresses are not shown.
- **No distrito municipal field.** **Sector** is the grouping level above recinto: Higüey → Sector → Recinto → Colegio. If the campaign later wants zones or DMs, the superadmin can add a simple sector→zone map. That is not planned now.
- **No printed colegio number** (the JCE "colegio 0123A" label). The UI shows `Colegio {idColegio}`.
- **No phones or emails.** Contact data is collected at registration.

**Rules derived from the data:**
- **Check digit is a warning, not a gate.** 87 real voters fail it, so eligibility is decided by the cédula existing in `voters`. The check digit is only used to warn about typos before the lookup.
- **Birth date is stored as `"YYYY-MM-DD"` text, never as a JS `Date`.** A midnight-UTC `Date` displayed in Dominican time (UTC−4) moves to the previous day, which would produce the **wrong default password**. `birthMonth` and `birthDay` are stored as integers for birthday queries.
- **Accent- and case-insensitive search.** Names are UPPERCASE with Ñ/Á/É/Í/Ó/Ú/Ü and a stray `´` (as in D´OLEO). We store `searchName` (NFD, diacritics and punctuation stripped, single spaces) and match prefixes on it.
- **`fullName`** = `nombres + apellido1 + (apellido2 ?? "")`, trimmed.
- **New voters:** people who turn 18 after the May 2024 cut are not in this file. A newer cut must be imported before the election (the `/admin/padron` importer handles this).

**Size on Atlas M0:** dropping the constant fields, a voter document is about 400 bytes of BSON (measured in 2.1 on the 181,551-record synthetic file: 72 MB of data, 19.5 MB compressed on disk, plus 25 MB of indexes). That is under 100 MB, roughly 19 % of the 512 MB limit.

### 3.2 Import (superadmin only)
1. The browser uploads the file **directly to a private S3 "imports" bucket** with a presigned PUT (≤ 150 MB, `application/json`). A 63 MB request body would exceed Vercel's request-size limits (4.5 MB for functions; don't rely on the rewrite proxy for large bodies), and it should not be buffered in Render's 512 MB of RAM. The object expires after 7 days.
2. The API **streams** the object from S3 (`stream-json`, constant memory; a CSV adapter would be added only if the export format ever changes). Each row is validated with the zod schema of §3.1 and bulk-inserted in batches of 1,000 into `voters_staging_{importId}`.
3. A **preview report** is shown in the UI: totals, rejected rows with reasons (downloadable), check-digit warnings, and a diff against the current data: new voters, voters who moved recinto or colegio, voters missing from the new file, recintos added or removed.
4. **Apply** runs on explicit confirmation:
   - bulk upsert into `voters`;
   - rebuild `recintos` from staging (colegio lists and voter counts);
   - mark voters missing from the new file as `inactive` (never delete them, because members may reference them);
   - refresh the `voterSnapshot` of members whose voter moved;
   - drop the staging collection.
5. `voterImports` keeps the history: file name, SHA-256, `cut` label (for example "mayo2024"), counts, uploader, timestamps, status.

Re-uploading the same file (same SHA-256) is rejected as a duplicate. **The real file never enters dev/test, the repo, or backups outside the prod bucket.** A synthetic generator produces files in exactly this JSON shape for development and tests.

---

## 4. System architecture

```
Browser (mobile-first)
   │  https://heribertova.do
   ▼
Vercel (Hobby) — frontend/ : Next.js 16
   │  rewrites /api/*  ──────────────▶  Render (Free → Starter at launch) — backend/ : Express 5 API
   │  (same-origin: no CORS,                  │                     │
   │   first-party cookies)                   ▼                     ▼
   │                               MongoDB Atlas M0          AWS S3 bucket (private)
   │                               (AWS us-east-1)           member photos + daily backups
   │                                                          (us-east-1)
                                            GitHub Actions (CI + daily backup trigger)
```

All data services sit in AWS **us-east-1** (Atlas) and **Virginia** (Render, Vercel `iad1`, S3), which is the lowest latency from the DR.

### 4.1 Tech stack (all free)

| Layer | Choice | Notes |
|---|---|---|
| Repo | One repo, npm workspaces: `frontend/`, `backend/`, `shared/` | `shared/` holds zod schemas, the roles/permissions map, cédula utils and settings types, used by both sides |
| Runtime | Node.js 22 LTS (or 24 LTS when Render/Vercel default to it), TypeScript `strict` | — |
| Frontend | **Next.js 16** App Router, React 19, **Tailwind v4 + shadcn/ui** (soft-beige theme), TanStack Query, React Hook Form + zod, ECharts, `browser-image-compression` | Banana uses Next 16; we swap MUI for Tailwind/shadcn: lighter, mobile-first, easy to theme |
| Backend | **Express 5** (native async error handling), zod validation, `helmet`, `express-rate-limit`, `cookie-parser`, `multer` (memory, small), `sharp`, `exceljs`, `stream-json` (voter import), `argon2`, `otplib` (superadmin TOTP), `pino` | Banana's stack, modernized: Express 5 instead of 4, zod instead of express-validator, argon2id instead of bcryptjs, no deprecated `csurf` |
| Database | **MongoDB Atlas M0** + **Mongoose 8** | Free. Supports multi-document transactions. No automatic backups on M0, so see §11 |
| Files | **AWS S3** private bucket, `@aws-sdk/client-s3` + `s3-request-presigner` | Setup steps in Appendix A.2 |
| CI / cron | **GitHub Actions** | lint, typecheck, test, build; daily backup trigger |
| Tests | Vitest, `mongodb-memory-server` (replica-set mode, for transactions), Supertest, Playwright | "Well-tested code is non-negotiable" (AGENTS.md) |
| Monitoring (free) | Render logs; UptimeRobot free on `/health`; Sentry free tier optional | — |

Everything that needed paid services in v1 of this design is gone: Postgres, Valkey, the worker, KYC, SMS and OTel.

### 4.2 Repository layout

```
heriberto-app/
  frontend/   Next.js: app/(auth)/login, app/(app)/{inicio,panel,padron,equipo,lideres,mi-recinto,recintos,reportes,perfil,admin}
  backend/    src/{app.ts,index.ts,config/,middleware/,modules/<module>/{routes,service,model,schemas}.ts,scripts/}
  shared/     src/{roles.ts,permissions.ts,schemas/,cedula.ts,settings.ts}
  .github/workflows/{ci.yml,backup.yml}
  docker-compose.dev.yml   (local dev: MongoDB single-node replica set + S3-compatible emulator)
  AGENTS.md / CLAUDE.md
```

Backend modules: `auth`, `users`, `voters`, `recintos`, `people`, `photos`, `promotions`, `dashboards`, `exports`, `settings`, `audit`, `backup`, `imports` (last).

---

## 5. Data model (MongoDB collections)

```ts
voters {            // from the uploaded file (§3.1); read-only except via import
  _id: string                    // cédula, 11 digits
  firstNames: string, lastName1: string, lastName2: string | null
  fullName: string, searchName: string        // searchName = normalized, accent-free, for prefix search
  birthDate: string              // "YYYY-MM-DD" — never a JS Date (timezone shift breaks default password)
  birthMonth: number, birthDay: number
  recintoKey: string, colegioId: number, sector: string
  checkDigitValid: boolean       // informational (87 real cédulas fail it)
  status: 'active'|'inactive', importId, updatedAt
}  idx: {recintoKey:1, colegioId:1}, {birthMonth:1, birthDay:1}, {searchName:1}, {status:1}
// ~400 B/doc × 181,551 ≈ 72 MB + ~25 MB indexes (measured, plan 2.1)

recintos {          // rebuilt on every import
  _id: recintoKey                // "escuela-primaria-rural--juanillo"
  name, sector, colegios: number[], voterCount
}  idx: {sector:1}

people {            // registered members (every leader/coordinator is also one)
  _id, cedula (unique), voterSnapshot: { fullName, recintoKey, recintoName, colegioId, sector, birthDate }
  nickname?, phone, phoneWhatsapp: bool, phone2?, phone2Whatsapp?, email?
  level: 'member'|'aspiring_leader'|'team_leader'|'coordinator'
  leaderId?: ObjectId          // the person whose team they belong to
  ancestors: ObjectId[]        // sponsor chain root→parent, for "everyone under me" queries
  registeredBy: ObjectId(users), status: 'confirmed'|'excused'|'not_contacted'|'deceased'|'resigned'|'sick'|'inactive'|null
  photos: { cedula?: {key, uploadedAt}, selfie?: {key, uploadedAt} }, docStatus: 'pending'|'partial'|'complete'
  validatedBy?, validatedAt?, consentAt, deletedAt?, timestamps
}  idx: {cedula:1} unique, {leaderId:1, deletedAt:1}, {ancestors:1}, {'voterSnapshot.recintoKey':1}, {'voterSnapshot.sector':1}, {level:1}

users {             // only for roles that log in
  _id, personId (unique), username (= cédula, unique), passwordHash (argon2id)
  role, recintoScopes: string[]   // recintoKeys, for recinto_coordinator
  usingDefaultPassword: bool, isActive, failedAttempts, lockUntil?, lastLoginAt?
  totpSecretEnc?                  // superadmin only (required for it): AES-256-GCM with TOTP_ENC_KEY
  totpLastUsedStep?               // last accepted TOTP time step: a code is never accepted twice
}  idx: unique partial {role:1} where role='superadmin'   → guarantees exactly one

totpChallenges { _id, tokenHash (unique), userId (unique), attempts, expiresAt (TTL) }   // plan 3.3: superadmin between password and TOTP; never a session

sessions { _id, tokenHash, userId, createdAt, lastSeenAt, expiresAt (TTL index), ip, ua }

leadershipEvents { personId, from, to, reason: 'nominated'|'auto_threshold'|'manual'|'demoted', actorUserId, memberCount, at }

settings { _id: 'promotion', nominationMinInitialMembers: 2, autoPromotionThreshold: 8, teamGoal: 20, maxOpenAspirantsPerNominator: 1 }

auditLogs { actorUserId, action, entity, entityId, summary (PII-masked), ip, at (TTL 365 d) }

voterImports { _id, cut, fileName, s3Key, sha256 (unique), report: { rows, accepted, rejected, warnings, totals, diff, source }, status: 'uploaded'|'validating'|'staged'|'applying'|'applied'|'failed', failureReason, uploadedBy, createdAt, appliedAt }   // plan 2.1 (CLI), 9.1 (UI)
```

**Why `ancestors` instead of recursive lookups:** "everyone under me" is one indexed query (`{ancestors: myPersonId}`), which is cheap on M0. This is the standard MongoDB tree pattern.

---

## 6. Business rules

### 6.1 Registering a member
Given a cédula:
1. It has 11 digits, otherwise it is rejected. A failed check digit only shows a "verifique la cédula" hint, because 87 real voters fail it (§3.1).
2. It exists in `voters` with `status: active`, otherwise: *"No figura en el padrón de Higüey"*. **Only Higüey voters can be registered.**
3. It is not already in `people`, otherwise: *"Ya está registrado(a)"*, plus the name of the leader if the caller is allowed to see it. A person belongs to exactly one team.
4. **There is no party-affiliation check.**
5. Required fields: primary phone (with a WhatsApp flag) and consent (a checkbox confirming the person agreed to be registered). Optional: nickname, second phone, email.
6. **Photos:** the cédula photo is required at creation (LOE parity); the selfie is optional. `docStatus` is `pending`, `partial` or `complete`. The save happens in two steps: create the record, then upload photos. A failed upload never creates duplicates, and the UI offers "subir foto" on the existing record.
7. The new member's `leaderId` is the registering person (an aspirant or leader), or a leader chosen by a coordinator. `ancestors = leader.ancestors + [leader._id]`.
8. After insert, run the promotion check (§6.2) in the same transaction.

### 6.2 Promotion engine
- **Nominate:** `POST /promotions/nominations {nomineeCedula, initialMembers[≥2]}`.
  - Callers: a recinto coordinator (in scope), a general coordinator, or a team leader (the nominee must be on their own team or a new person).
  - Limit: at most `maxOpenAspirantsPerNominator` open aspirants per nominator.
  - In a single transaction: create or update the nominee as `aspiring_leader`, register the initial members under them, create the `users` account (default password = birthdate), and write a `leadershipEvent`.
- **Auto-promotion:** after each member insert or soft delete, count the aspirant's direct members. If the count is ≥ `autoPromotionThreshold`, run `updateOne({_id, level:'aspiring_leader'}, {$set:{level:'team_leader'}})`. The conditional filter makes promotion happen **exactly once**, even under concurrent inserts. On success: update `users.role`, write the event, and set `permissionsStale` on the user's sessions so the UI shows the celebration and refreshes without a new login (LOE parity).
- **Manual promotion or demotion** (superadmin or general coordinator) requires a reason and is audited. Demotion is never automatic.
- **Deactivating a leader** disables their login; their members stay attached. A person who still has members cannot be deleted.

### 6.3 Scope (who sees what)
| Role | Read/write scope |
|---|---|
| superadmin, general_coordinator | everything |
| recinto_coordinator | people whose `voterSnapshot.recintoKey ∈ recintoScopes`, plus people in their own subtree; voters of those recintos |
| team_leader, aspiring_leader | their own subtree (`ancestors` contains them); voters of **their own recinto** (Mi Recinto) |

The server enforces scope on every query and every `:id` route. The UI only hides what the server would refuse anyway.

---

## 7. Authentication

- **Login:** cédula + password.
- **Default password = birth date as `DDMMYYYY`** (LOE behavior, chosen because users are not technical). It is set when an account is created: at nomination, or when a coordinator is appointed. It is hashed with argon2id and never stored in plain text. `usingDefaultPassword: true` until the user changes it.
- **Accepted trade-off:** birth dates are known to anyone who has the padrón, which every party receives, so a default password is guessable. Mitigations:
  1. Per-account lockout: 5 failures → 15 min, growing.
  2. Per-IP rate limit.
  3. After the first login, a **simple, skippable "Cambie su contraseña" prompt** and a persistent banner while the default is still in use.
  4. The admin user list shows who still uses the default.
  5. Login audit.
  6. The **superadmin never uses a birth-date password**: it gets a strong password plus TOTP and is created once from `/configuracion-inicial`.
- **Change password:** at `/perfil`. Minimum 8 characters (14 for the superadmin), it cannot equal the birth date (DDMMYYYY or YYYYMMDD, with or without separators), and it requires the current password. Other sessions end; the current one stays.
- **Forgot password:** there are no SMS/email costs. The user asks their coordinator, who can **"Restablecer a fecha de nacimiento"**. That resets the password to the default, unlocks the account, revokes sessions and is audited. The caller must have the user in scope and **outrank** them (plan 3.2), so nobody resets a peer or a superior; the superadmin can reset anyone else. The superadmin's own password is never reset to a birth date.
- **Superadmin second factor (plan 3.3):** a right password answers `202 {totpRequired: true}` with a 5-minute `__Host-totp` challenge cookie, which opens nothing but `POST /auth/totp/verify` (it lives in its own `totpChallenges` collection, never in `sessions`). A valid RFC 6238 code (SHA-1, 6 digits, 30 s, ±1 step) turns it into a session. Each code is accepted once (replay), a challenge takes at most 5 codes (claimed atomically), wrong codes count toward the same progressive lockout as wrong passwords (a right password alone does not reset it), and failed codes are rate-limited per IP. The superadmin is created once, from `/configuracion-inicial` (A.3): a public but self-limiting page (`GET /setup/status` reports whether it is still open; once the account exists, `POST /setup/superadmin` refuses permanently). A TOTP secret is generated at creation but never shown then — the 202 response above carries it (as a QR code and as text) only the very first time, before any code has ever been accepted, so enrollment happens on that first login instead of a CLI terminal.
- **Sessions:** a random 256-bit token lives in a `__Host-sid` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`). Only its SHA-256 is stored in `sessions`. Timeouts: 7 days idle and 30 days absolute (field users on shared phones stay usable), 12 h for superadmin. The token rotates on login and on role change. There are no JWTs in `localStorage`.
- **CSRF:** SameSite=Lax, plus a required `Origin` check on unsafe methods, plus the `X-Requested-With` header.
- **Deactivated users** are rejected on their next request, because the session lookup checks `users.isActive`.

## 8. Authorization

- `shared/permissions.ts` holds a typed `ROLE_PERMISSIONS` map, e.g. `voters.lookup`, `people.create`, `people.update`, `people.delete`, `people.validate`, `people.export`, `leaders.nominate`, `leaders.promoteManual`, `recintos.assignCoordinator`, `users.manage`, `users.resetPassword`, `dashboards.general`, `reports.view`, `settings.manage`, `voters.import` (superadmin only), `audit.view`.
- Backend: the `requireAuth` middleware, then `requirePermission('people.create')`, then a service-level `scopeFilter(user)` / `assertInScope(user, person)`.
- Frontend: `/api/me` returns `{user, person, role, permissions, usingDefaultPassword, landing}`. It drives the nav, a `<Can>` component and route guards.
- Every endpoint is declared in one route registry (`backend/src/routing/registry.ts`) with its access: `public`, `authenticated`, or a permission; the guards are applied from that declaration, before validation.
- CI runs an **authorization matrix test** (role × endpoint × in-scope/out-of-scope) generated from the registry; a route without a matrix case, or served outside the registry, fails it.
- Role assignments (plan 4.1): superadmin has everything; `voters.import`, `settings.manage` and `audit.view` are superadmin-only; `users.manage`, `recintos.assignCoordinator` and `leaders.promoteManual` add the general coordinator; `people.validate`, `people.export`, `users.resetPassword`, `dashboards.general` and `reports.view` add the recinto coordinator; `leaders.nominate` adds the team leader; every role has `voters.lookup` and `people.create/update/delete`. Landing pages: coordinators `/panel/general`, leaders and aspirants `/panel`.

## 9. API (REST, `/api`, JSON, zod-validated)

Errors use `{ error: { code, message, fields? } }`; lists use `{ items, page, pageSize, total }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /me`, `PUT /me/password`, `POST /auth/totp/verify` (superadmin) |
| Setup (public, one-time) | `GET /setup/status`, `POST /setup/superadmin` — creates the superadmin; refuses permanently once one exists |
| Voters | `GET /voters/:cedula` (not audited, daily quota per user), `GET /recintos/:key/voters?filter=all|nonMembers&colegio=&q=&page=` |
| People | `POST /people/check {cedula}`, `POST /people`, `GET /people?scope=team|subtree|recinto&q=&status=&docStatus=`, `GET /people/:id`, `PATCH /people/:id`, `DELETE /people/:id` (soft) |
| Photos | `POST /people/:id/photos/:kind` (multipart ≤ 8 MB), `GET /people/:id/photos/:kind` → 302 to a presigned S3 URL (5 min) |
| Leadership | `POST /promotions/nominations`, `POST /promotions/:personId/promote`, `POST /promotions/:personId/demote`, `GET /leaders?level=` |
| Recintos | `GET /recintos?sector=&withoutMembers=`, `GET /recintos/:key/summary`, `PUT /recintos/:key/coordinators`, `GET /sectors` (sector → recintos → colegios tree) |
| Users | `GET /users`, `POST /users` (appoint coordinator), `PATCH /users/:id` (activate, scopes), `POST /users/:id/reset-password` |
| Dashboards | `GET /dashboards/leader`, `GET /dashboards/general` |
| Exports | `GET /exports/people.xlsx?…`, `GET /exports/recintos.xlsx` (streamed, scoped, watermarked) |
| Admin | `GET/PUT /settings/promotion`, `GET /audit`, `POST /backups` (superadmin, manual trigger only), `GET /backups/status` |
| Voter import (superadmin) | `POST /imports/upload-url` (presigned S3 PUT), `POST /imports` `{s3Key, cut}` (starts streaming validation), `GET /imports/:id` (status + report), `GET /imports/:id/rejected.csv`, `POST /imports/:id/apply`, `DELETE /imports/:id` (discard staged) |

## 10. Frontend

**Theme:** soft beige and soft brown. The tokens, contrast ratios and logo files live in `brand/BRAND.md`:
- background `#F5EFE6`, surface `#FBF8F3`, border `#EADFCF`, text `#3B3024`
- primary `#8B6B4A` (buttons with white text, 4.9:1)
- `#5E4630` for links and small brown text, because `#8B6B4A` on beige is only 4.3:1
- gold `#E4C99F` accents

Font: Poppins (`next/font/google`). Logo: an H whose crossbar is a check mark (`brand/logo-*.svg`), used as favicon and PWA icons.

The layout is designed for phones first (360 px), with large tap targets and plain Spanish copy for non-technical users.

**Screens (LOE parity where kept):**

| Route | Screen | LOE equivalent |
|---|---|---|
| `/login` | Cédula (mask `000-0000000-0`), password, "¿Olvidó su contraseña? Contacte a su coordinador" | login |
| `/configuracion-inicial` | One-time, public: creates the superadmin (§7, A.3.7). Gone for good once the account exists. | — |
| `/inicio` | Redirects to the role's landing page | — |
| `/panel` | Leader dashboard: my members, progress to 8 (radial red/amber/green), goal 20, aspirants I nominated, members' birthdays this month, promotion celebration | ci-dashboard |
| `/panel/general` | Coordinators: coverage by sector → recinto → colegio, leaders' progress, recintos without members, members and voters by **age band** (the file has no sex field), birthdays | dashboard / provincial |
| `/padron` | Voter lookup by cédula: name, age and birthday, sector, recinto, colegio, and whether they are already a member and in which team (if in scope) | consulta-padron |
| `/equipo` | Register and list my members, add photos, edit, delete | registro-miembros + lista-miembros-cb |
| `/lideres` | Leaders and aspirants with their teams; nominate an aspirant ("Registre N más para habilitar") | ptes-cbs |
| `/mi-recinto` | Recinto stats (voters, members, colegios), voter list filterable by colegio and "no son miembros", accent-insensitive name search, register a voter as member, nominate | mi-recinto |
| `/recintos` | Recintos list with coverage, recintos without members, assign coordinators | recintos-sin-militantes |
| `/reportes` | Filtered tables with Excel export | reportes |
| `/perfil` | My data, change password | user-info |
| `/admin/usuarios`, `/admin/configuracion`, `/admin/auditoria`, `/admin/respaldos`; `/admin/padron` (voter file import + history) | Admin area | — |

`proxy.ts` (Next 16) redirects visitors without a session cookie to `/login`. Real authorization always happens on the API.

**Photo capture:** the browser opens the phone camera (`<input capture>`) and compresses the image on the device to about 1600 px before upload. This saves data for field users.

## 11. Files, backups and storage budget

- **Photos:** uploaded through the API, not directly to S3, so the server stays in control.
  - multer (memory) → check that the bytes really are JPEG/PNG/HEIC → `sharp` re-encodes to JPEG (max 1600 px, quality 80), which **removes EXIF/GPS** data.
  - The file is stored as `people/{personId}/{kind}-{uuid}.jpg` (about 150–250 KB).
  - Viewing uses 5-minute presigned GET URLs, issued only after a scope check.
- **Backups:** M0 has no automatic backups, and none are scheduled here either — the owner decided a
  single manual backup is enough for this campaign's size, not a daily cron.
  - `POST /api/backups` (superadmin only) streams every collection except `sessions` as gzipped NDJSON
    to `s3://…-backups/backup/`, with a manifest (counts, hashes). There is no cron, no HMAC-signed
    endpoint and no dated history: the superadmin triggers it from `/admin/respaldos` whenever they
    choose, and each run replaces the previous backup — exactly one is ever kept, so there is no
    lifecycle rule to prune old ones.
  - `GET /api/backups/status` (the same admin widget) shows the last backup's time and size.
  - `backend/scripts/restore.ts --target-uri <uri>` restores the kept backup into a target database.
  - The restore is tested before launch.
- **Atlas M0 budget (512 MB):** voters ≈ 60 MB including indexes (measured from the 181,551-record file; about 120 MB for a few minutes during an import while staging exists), people and users ≈ 10–30 MB, audit is capped by a 365-day TTL, and sessions are cleaned by TTL. An admin widget shows `dbStats` and warns at 80 %.

## 12. Security checklist (proportionate)

- HTTPS only (Vercel/Render), HSTS, and helmet with a strict CSP (no third-party scripts).
- zod on every input; React escapes output; no raw HTML.
- Rate limits: global per IP, login per IP+username, voter lookups with a daily per-user quota (for example 300; configurable), and exports.
- Least privilege:
  - The Atlas DB user has `readWrite` on the app database only.
  - The Atlas IP allowlist contains **Render's outbound IPs** (fallback `0.0.0.0/0` plus a strong password if needed).
  - The S3 IAM user can only touch its own bucket.
- Secrets live only in Render/Vercel/GitHub environment variables, never in the repo. `.gitignore` covers `.env*`, key CSVs, dumps and **`padron_*.json` / `padron_*.csv`**. The real voter file (`padron_higuey_mayo2024.json`) must be moved out of the repository folder before `git init`.
- Logs mask cédulas (`001-*****-2`), phones and emails. Session tokens are never logged.
- Audit covers: logins (success and failure), people create/update/delete, nominations and promotions, password resets, user changes, exports, imports and backups. Padrón lookups are not audited — too frequent and routine — but still count toward their own daily quota (§9, §12 rate limits).
- **Privacy (Ley 172-13):** a consent checkbox is recorded at registration; data is used only for the campaign; there is a deletion path for people who ask to be removed; and data is deleted after the campaign, as decided by the owner.

## 13. Free-tier limits and when to pay

| Service | Free tier limits that matter | When to upgrade |
|---|---|---|
| **Render Free** | Sleeps after 15 min idle; the first request takes about 30–60 s to wake; 512 MB RAM; 750 h/month | **At launch**: switch to Starter (~US$7/mo) so field users never hit a cold start. Before that, UptimeRobot pinging `/health` every 5 min keeps it warm (one service fits within 750 h) |
| **Vercel Hobby** | Terms of service say "personal, non-commercial". A political campaign is a gray area | If the campaign wants zero risk, or needs team access: Pro (~US$20/mo) |
| **Atlas M0** | 512 MB; shared CPU; throughput cap (~100 ops/s); no backups (solved in §11) | Only if storage or throughput runs short: Flex/M10 |
| **AWS S3** | Accounts opened after 15 Jul 2025 get the new Free plan, which is time-limited credits rather than a 12-month free tier; check the current terms at aws.amazon.com/free | Expected cost after credits: pennies to about US$1/mo (≈ 10 GB photos + backups). *Free alternative if ever wanted:* Cloudflare R2 (10 GB free forever, same S3 API) |
| **GitHub Actions, UptimeRobot, Sentry (dev tier)** | Generous free tiers | — |

## 14. Open items

1. ~~Voter file sample~~: **resolved** (JSON array, format documented in §3.1). Only confirm that future exports keep the same keys, and get a newer cut once the JCE publishes it (new 18-year-olds are missing from the May 2024 cut).
2. ~~Palette and logo~~: **resolved** (`brand/`). Replace them if the campaign commissions a professional identity.
3. Whether coordinators need a zone level (a group of recintos under one person) above recinto coordinators. Default: no; a recinto coordinator can hold many recintos.

---

## Appendix A — Service setup, step by step

**When:** plan Phase 10.1, after the app is complete and verified locally.
- **Development** runs entirely on the developer machine: docker-compose provides MongoDB and an S3-compatible emulator, and the Next dev server rewrites `/api` to `localhost:4000`. **No cloud accounts are needed to develop.**
- The cloud hosts **prod only**. The `-dev` names below are optional, only for a future staging environment.

### A.1 MongoDB Atlas (M0, free)
1. Sign up at cloud.mongodb.com. Create an organization "Heriberto" with project `heribertova-prod` (one free M0 per project; add `heribertova-dev` only if a cloud staging environment is ever wanted).
2. In each project: **Create cluster → M0 Free → provider AWS, region us-east-1 (N. Virginia)**, name `heribertova`.
3. **Database Access → Add user**: `app_prod` (and `app_dev`), password auth with a generated 32+ character password. **Built-in role: `readWrite` on database `heribertova`** only; do not grant `atlasAdmin`.
4. **Network Access → Add IP**: add the Render service's outbound IPs (Render → service → **Connect → Outbound**). If they are unavailable on the free plan, add `0.0.0.0/0` temporarily and tighten it when moving to Starter.
5. **Connect → Drivers** gives the URI: `mongodb+srv://app_prod:<pwd>@heribertova.xxxxx.mongodb.net/heribertova?retryWrites=true&w=majority`. Store it only in Render as `MONGODB_URI`.
6. Enable project alerts (email) for "Disk usage > 80 %" and "Connections > 80 %".

### A.2 AWS S3 (photos, backups, voter-file imports)
1. **Account:** sign up at aws.amazon.com and choose the Free plan (read the current credit terms). Immediately:
   - **enable MFA on the root user** (IAM → Security credentials);
   - create **Billing → Budgets → "Zero spend budget"** and a **Monthly cost budget of US$5** with email alerts.
2. Region: **us-east-1** for everything below.
3. **Create the photos bucket.** S3 → Create bucket → `heribertova-media-prod`:
   - Object Ownership: **ACLs disabled (Bucket owner enforced)**
   - **Block all public access: ON** (all four boxes)
   - Bucket Versioning: Disabled (saves cost; backups cover recovery)
   - Default encryption: **SSE-S3** (free)
4. **Create the backups bucket.** `heribertova-backups-prod`, same settings. No lifecycle rule: exactly one backup is ever kept (the API deletes the previous one's objects itself before writing the next), so there is nothing for a rule to expire.
5. **Create the imports bucket.** `heribertova-imports-prod`, same settings as the photos bucket. Then:
   - **Lifecycle rule** "expire-7d": expire current versions after **7 days**, and also delete incomplete multipart uploads after 1 day. The voter file is only needed until it is applied.
   - **Permissions → CORS** (only this bucket needs it, because the browser uploads the voter file straight to it with a presigned PUT):
     ```json
     [
       { "AllowedOrigins": ["https://heribertova.do"],
         "AllowedMethods": ["PUT"],
         "AllowedHeaders": ["content-type", "content-md5"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3000 }
     ]
     ```
   - The photos and backups buckets need **no CORS**: photos go through our API, and `<img>` tags load presigned URLs without CORS.
6. **IAM policy for the API.** IAM → Policies → Create → JSON → name `heribertova-api-prod`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::heribertova-media-prod/*" },
       { "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::heribertova-media-prod" },
       { "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
         "Resource": ["arn:aws:s3:::heribertova-backups-prod", "arn:aws:s3:::heribertova-backups-prod/*"] },
       { "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::heribertova-imports-prod/*" }
     ]
   }
   ```
   `s3:ListBucket` on the media bucket (the bucket ARN, not `/*`) is what `HeadBucket` needs: `GET /health` uses it to report S3 as up. The API signs the browser's PUT URL for the imports bucket with its own credentials, so it needs `PutObject` there, plus `GetObject` to stream the file and `DeleteObject` to discard it. On the backups bucket the API needs `ListBucket` too (to find the previous backup's objects before deleting them, since only one is ever kept) plus `GetObject` for `restore.ts` and the status widget's manifest read.
7. **IAM user.** IAM → Users → Create `heribertova-api-prod`: **no console access**, attach the policy above. Then Security credentials → **Create access key** → use case "Application running outside AWS" → copy the key id and secret **once**.
8. **Render environment variables:** `AWS_REGION=us-east-1`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_MEDIA_BUCKET=heribertova-media-prod`, `S3_BACKUP_BUCKET=heribertova-backups-prod`, `S3_IMPORTS_BUCKET=heribertova-imports-prod`. Leave `S3_ENDPOINT` unset and `S3_FORCE_PATH_STYLE=false` (those two only point the SDK at the local emulator). Never commit the key CSV AWS offers to download; don't keep it in the project folder either.
9. **Verify** with `npm run s3:check --workspace=backend`, which puts, gets and deletes a test object (the same script is used against the local emulator in Phase 1.4).
10. Rotate access keys every 90 days (create new → update Render → delete old).

### A.3 Render (API)
1. render.com → sign in with GitHub → **New → Web Service** → pick the repo.
2. Name `heribertova-api`, region **Virginia (US East)**, branch `main`, **Root Directory** `backend`, runtime Node.
3. Build command `npm ci --include=dev && npm run build`; start command `node dist/index.js`. The `--include=dev` is required: with `NODE_ENV=production` set (below), npm's default `omit` config drops devDependencies from `npm ci`, but the build needs them (`esbuild` bundles `dist/`). If a stale build cache makes the flag not take effect, also set the environment variable `NPM_CONFIG_INCLUDE=dev` (below) — that overrides npm's config directly — and redeploy with **Clear build cache & deploy**.
4. Instance type **Free** for now (Starter at launch, see §13). **Health Check Path** `/health`.
5. Environment variables:
   - `NODE_ENV=production`
   - `NPM_CONFIG_INCLUDE=dev` (only needed if the build command's `--include=dev` doesn't take effect, e.g. after a cached build; see step 3)
   - `MONGODB_URI`
   - AWS vars (A.2)
   - `TOTP_ENC_KEY` (32 random bytes, base64: `openssl rand -base64 32`; keep this value somewhere safe — losing it means re-enrolling the superadmin's TOTP)
   - `APP_ORIGIN=https://heribertova.do` (the only `Origin` the CSRF guard accepts)
   - optionally `LOGIN_RATE_LIMIT_MAX` (default 10 failed logins per IP + cédula per 15 min)

   No session pepper: session tokens are 256 random bits, so their plain SHA-256 is already unguessable (plan 3.1).
6. Optional custom domain `api.heribertova.do` (CNAME to the `onrender.com` host). The browser does not need it, because traffic goes through Vercel rewrites.
7. Create the superadmin: once the API and web app are both live, and **before sharing the URL with anyone**, visit `https://heribertova.do/configuracion-inicial` and fill in the one-time setup form (cédula, name, birth date, phone, recinto/sector, password). It does not need the padrón imported first — the owner's details are typed in directly, not looked up — so this can happen before `voters:import --apply`. The form works exactly once: `GET /api/setup/status` reports whether it is still open, and the moment the account exists, every further visit (or `POST`) refuses. No Shell access needed, on the Free plan or otherwise. Afterwards, log in at `/login`: the first login shows the TOTP QR code to scan with an authenticator app (Google Authenticator, Authy…) — enter the code it shows to finish enrolling. That QR is shown only this once; losing the device before enrolling means recreating the account (drop the `users` document and start over, since only one superadmin may exist).

### A.4 Vercel (web)
1. vercel.com → sign in with GitHub → **Add New Project** → import the repo, **Root Directory** `frontend`, framework Next.js.
2. Environment variable `API_ORIGIN=https://heribertova-api.onrender.com` (used by `next.config.ts` rewrites `/api/:path*` → `${API_ORIGIN}/api/:path*`).
3. Project settings → Functions region **Washington, D.C. (iad1)**.
4. **Domains:** add `heribertova.do` and `www.heribertova.do` (redirect www → apex).

### A.5 Domain (heribertova.do, registered at NIC.do)
At whichever DNS host the domain uses (NIC.do's DNS, or Cloudflare free DNS if nameservers are pointed there):
- `A  @  76.76.21.21` (Vercel apex; use the value Vercel shows)
- `CNAME  www  cname.vercel-dns.com`
- optional `CNAME  api  heribertova-api.onrender.com`

Wait for Vercel/Render to show the certificate as issued.

### A.6 GitHub
- Repo **private**.
- Branch protection on `main` (PR + green CI).
- Workflows: `ci.yml` (on PR). No backup workflow: backups are a manual, in-app action (`POST /api/backups`, §11), not a scheduled GitHub Actions job.
- Enable Dependabot security updates and secret scanning.

### A.7 UptimeRobot (optional, free)
Monitor `https://heribertova.do/api/health` every 5 min with email alerts. This also keeps Render Free warm until the Starter upgrade.
