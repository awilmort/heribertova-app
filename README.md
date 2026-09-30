# Heriberto

Campaign app for the Higüey mayoral campaign: a Next.js frontend (`frontend/`), an Express API
(`backend/`) and the contracts they share (`shared/`), in one npm workspace.

Start with `HERIBERTO_ARCHITECTURE.md` (design) and `HERIBERTO_IMPLEMENTATION_PLAN.md` (phases).
Engineering rules are in `AGENTS.md`.

## Local setup

Prerequisites: Node 22 (`.nvmrc`) and Docker. No cloud account is needed for development.

```sh
npm install                                        # also installs the git pre-commit hook
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
npm run dev:up                                     # MongoDB + S3 emulator + local buckets
npm run dev                                        # API on :4000, web app on :3000
```

Open http://localhost:3000. The home page shows the API status; http://localhost:3000/api/health
should report `{"status":"ok","mongo":"up","s3":"up"}`. `npm run dev:down` stops the services
(data is kept in Docker volumes).

**A user to log in with.** The database starts empty: no public registration exists, and normally
only a voter's cédula can be registered. For manual testing:

```sh
npm run superadmin:seed      # a working superadmin, no padrón import needed
npm run voters:seed          # 20 synthetic voters, generated and imported in one go
```

`superadmin:seed` logs in with cédula `00100000001` and password `***************` (override
with `npm run superadmin:seed --workspace=backend -- --cedula <11 digits> --password <text>`). It
fabricates its own profile, so it needs nothing else first. It still enrolls TOTP for real
(superadmin login always requires it): log in at `/login` and the app shows the QR code to scan on
that first login, same as the real `/configuracion-inicial` flow (below) would. Refuses outside
`NODE_ENV=development`, and refuses if a superadmin already exists (there is only ever one — drop
the database, or `docker compose -f docker-compose.dev.yml down -v`, to start over).

`voters:seed` is for testing flows that need actual padrón data (`/padron` lookup, registering a
member, other roles). It just chains `voters:fake` and `voters:import --apply` with fixed defaults;
reach for those two individually (both need `--workspace=backend`, see the script table below) if
you want a different voter count or a custom file.

The real superadmin flow is what production uses: visit `/configuracion-inicial` once (a public
page that only ever works before a superadmin exists) and fill in the owner's real details
directly — it doesn't need the padrón imported first, unlike everyone else in the app.

**Logging in locally.** The session cookie is `__Host-sid` (`Secure`, `HttpOnly`, `SameSite=Lax`).
Browsers accept `Secure` cookies from `http://localhost`, so it works over plain http as long as
you open the app at **http://localhost:3000** (not `127.0.0.1` or a LAN IP; Chrome and Firefox are
known to work, Safari may drop it). The browser only ever talks to :3000; Next forwards `/api/*` to
the API, which only accepts state-changing requests whose `Origin` is `APP_ORIGIN`
(`http://localhost:3000` in `backend/.env`).

The `.env.example` values are local-only: the emulator's throwaway credentials. Real secrets live
only in the hosting providers' settings.

## Scripts

Run from the repository root.

| Script | What it does |
| --- | --- |
| `npm run dev:up` / `npm run dev:down` | Start / stop local MongoDB (replica set) and the S3 emulator; `dev:up` also creates the `media`, `backups` and `imports` buckets (console: http://localhost:9001) |
| `npm run dev` | Run the API and the web app in watch mode |
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | The CI gates; all must pass before a PR merges |
| `npm run format` | Format with Prettier |
| `npm run voters:seed` | **Dev only.** Generate 20 synthetic voters and import them, in one step (fixed `--cut dev`) |
| `npm run superadmin:seed` | **Dev only.** Create the superadmin from a fixed cédula and password (defaults `00100000001` / `******************`, overridable via `--workspace=backend -- --cedula ... --password ...`), with no padrón import needed. TOTP is enrolled on the first login in the app (real flow, below), not printed by this script. Refuses outside `NODE_ENV=development` or if a superadmin exists |
| `npm run s3:check` | Put, get and delete a test object in the media and imports buckets of the configured S3 |

Anything more specific than the above (a custom voter count, a dry run, a particular file) goes
through the backend package directly, which needs `--workspace=backend` and, for extra flags, a
`--` before them (otherwise npm treats `--out`/`--file`/etc. as its own flags):

| Script | What it does |
| --- | --- |
| `npm run voters:fake --workspace=backend -- --out <path> [--voters 20]` | Write a synthetic Higüey voter file in the real export's shape (`tmp/` is gitignored; 20 voters by default, 181551 = real size) |
| `npm run voters:import --workspace=backend -- --file <path> --dry-run` | Validate a voter file and print its report (accepted, rejected, check-digit warnings, recintos, colegios, sectors, diff); writes nothing |
| `npm run voters:import --workspace=backend -- --file <path> --cut <label> [--apply]` | Stage the file (report only), or with `--apply` stage and apply it to `voters`/`recintos`. The same file (SHA-256) is never imported twice |

## Git

Work on branches and merge through pull requests; `.github/workflows/ci.yml` runs the gates.
The pre-commit hook (`scripts/pre-commit.mjs`) refuses voter data (`padron_*`), environment files
(`.env*`, `*.env`; `.env.example` is allowed) and AWS access-key CSVs. **Real voter data never
enters this repository**: development uses synthetic files.
