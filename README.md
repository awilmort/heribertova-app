# Heriberto

Campaign app for the Higüey mayoral campaign: a Next.js frontend (`frontend/`), an Express API
(`backend/`) and the contracts they share (`shared/`), in one pnpm workspace.

Start with `HERIBERTO_ARCHITECTURE.md` (design) and `HERIBERTO_IMPLEMENTATION_PLAN.md` (phases).
Engineering rules are in `AGENTS.md`.

## Local setup

Prerequisites: Node 22 (`.nvmrc`) and Docker. No cloud account is needed for development.

```sh
corepack enable                                    # pnpm at the version pinned in package.json
pnpm install                                       # also installs the git pre-commit hook
cp backend/.env.example backend/.env && cp frontend/.env.example frontend/.env.local
pnpm dev:up                                        # MongoDB + S3 emulator + local buckets
pnpm dev                                           # API on :4000, web app on :3000
```

Open http://localhost:3000. The home page shows the API status; http://localhost:3000/api/health
should report `{"status":"ok","mongo":"up","s3":"up"}`. `pnpm dev:down` stops the services
(data is kept in Docker volumes).

The `.env.example` values are local-only: the emulator's throwaway credentials and Cloudflare's
public Turnstile test keys. Real secrets live only in the hosting providers' settings.

## Scripts

Run from the repository root.

| Script | What it does |
| --- | --- |
| `pnpm dev:up` / `pnpm dev:down` | Start / stop local MongoDB (replica set) and the S3 emulator; `dev:up` also creates the `media`, `backups` and `imports` buckets (console: http://localhost:9001) |
| `pnpm dev` | Run the API and the web app in watch mode |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | The CI gates; all must pass before a PR merges |
| `pnpm format` | Format with Prettier |
| `pnpm --filter backend s3:check` | Put, get and delete a test object in the media and imports buckets of the configured S3 |
| `pnpm --filter backend voters:fake --out tmp/voters-20k.json [--voters 20000]` | Write a synthetic Higüey voter file in the real export's shape (`tmp/` is gitignored; 181551 voters = real size) |
| `pnpm --filter backend voters:import --file <path> --dry-run` | Validate a voter file and print its report (accepted, rejected, check-digit warnings, recintos, colegios, sectors, diff); writes nothing |
| `pnpm --filter backend voters:import --file <path> --cut <label> [--apply]` | Stage the file (report only), or with `--apply` stage and apply it to `voters`/`recintos`. The same file (SHA-256) is never imported twice |

## Git

Work on branches and merge through pull requests; `.github/workflows/ci.yml` runs the gates.
The pre-commit hook (`scripts/pre-commit.mjs`) refuses voter data (`padron_*`), environment files
(`.env*`, `*.env`; `.env.example` is allowed) and AWS access-key CSVs. **Real voter data never
enters this repository**: development uses synthetic files.
