# Branching, environments and deployment

Owner decision (2026-11-08): this project uses a three-branch model with **two** deploy-eligible
branches. It intentionally replaces the earlier global default where only `main` and `develop` could
deploy and `staging` was excluded. The project-specific rule below is the authoritative one for this
repository; the general prohibitions in the global instructions still apply to every other branch.

## Branches

| Branch | Role | Deploys | Merged from | Merged to |
| --- | --- | --- | --- | --- |
| `main` | Production | **Yes** — production | `staging` | — |
| `staging` | Preview | **Yes** — preview | `develop` | `main` |
| `develop` | Integration / reconciliation | No | task branches | `staging` |
| `feat/*`, `fix/*`, `chore/*`, `agent/*` | Task work | No | — | `develop` |

Rules:

- Task branches merge into `develop` continuously, with no pull request (owner decision: direct
  merges). A merge commit per task branch keeps the attribution intact.
- `develop` → `staging` at each phase exit, once the phase gate passes. This produces the preview
  deployment used to verify the phase.
- `staging` → `main` after preview verification. This is the production release and the commit that
  gets tagged. Production promotion is human-owned unless the owner explicitly delegates it.
- Never force-push a shared branch. Never rewrite history on `main`, `staging` or `develop`.

## Deployment allowlist

Enforcement lives in `vercel.json`:

```json
"git": { "deploymentEnabled": { "*": false, "**": false, "main": true, "staging": true } }
```

- Every branch not named in the map — including pull-request previews, `develop`, `feat/*`,
  `agent/*`, Dependabot and temporary worktrees — is refused before a build starts.
- `"**"` is included because a single `*` does not match branch names containing `/`.
- The map must live on the branch Vercel reads configuration from. Until this file is on `main`, the
  platform may still build other branches. Verify after the first `main` push and record the result.
- Deploy hooks, CLI deploys (`vercel deploy`, `--prod`, `promote`, `redeploy`, `rollback`) and
  deployment APIs are not part of this project's flow. Do not create them. A push to an eligible
  branch is the only deployment trigger.

## Environments and secrets

| Environment | Branch | Supabase | Notes |
| --- | --- | --- | --- |
| Production | `main` | Production project | Migrations applied here are authorized (pre-release product) |
| Preview | `staging` | Same project until a preview project exists | Preview shares data with production; treat preview writes as real |
| Local | any | Production project via `.env.local` | Local migrations are the same reviewed SQL files |

Vercel environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `APP_URL`) are configured per environment in the Vercel
project, not committed. `.env.local` is gitignored and never leaves the machine.

## Verification instead of deployment

- CI (`.github/workflows/ci.yml`) gates typecheck, tests and build on every push to `main`,
  `staging` and `develop`.
- Deployment configuration is validated statically (`vercel.json`, workflow inspection). Never
  deploy to test the policy.
- After an eligible push, confirm the deployment exists and matches the pushed commit; that is
  observation of an automatic side effect, not a manual deploy.
