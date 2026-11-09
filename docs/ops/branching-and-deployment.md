# Branching, environments and deployment

Status: active from 2026-11-09. This supersedes the 2026-11-08 three-branch note.

Owner decision (2026-11-09): `main` is production, `develop` is integration **and** the development
deployment. `staging` is retired and is not deploy-eligible. The authoritative policy, including the
enforcement and branch-protection requirements, is `docs/security/deployment-governance.md`.

## Branches

| Branch | Role | Deploys | Merged from | Merged to |
| --- | --- | --- | --- | --- |
| `main` | Production | **Yes** — production | `develop` | — |
| `develop` | Integration / reconciliation | **Yes** — development | task branches | `main` |
| `staging` | Retired (kept only for history) | **No** | — | — |
| `feat/*`, `fix/*`, `chore/*`, `agent/*`, `dependabot/*` | Task work | **No** | — | `develop` |

Rules:

- Task branches merge into `develop`; a merge commit per task keeps the attribution intact. The owner
  currently allows direct merges rather than requiring a pull request; branch protection is the
  target state and is documented in `docs/security/deployment-governance.md`.
- `develop` must pass CI (`typecheck / test / build`). A push to `develop` triggers the automatic
  development deployment; verify the deployed commit and the relevant flows.
- `develop` promotes to `main` only when the owner explicitly authorizes that production promotion.
  The push to `main` triggers the production deployment and is the commit that gets tagged.
- `staging` receives no promotions and no deployments. Do not push it.
- Never force-push or rewrite history on `main` or `develop`.

## Deployment allowlist

Enforcement lives in `vercel.json`:

```json
"git": { "deploymentEnabled": { "*": false, "**": false, "main": true, "develop": true } }
```

- Every branch not named in the map — including pull-request previews, `staging`, `feat/*`,
  `agent/*`, Dependabot and temporary worktrees — is refused before a build starts.
- `"**"` is included because a single `*` does not match branch names containing `/`.
- The map must live on the branch Vercel reads configuration from. Until this file is on `main`, the
  platform may still honour an older allowlist. Verify the first eligible deployment after promotion;
  never create an ineligible deployment to test the policy.
- Deploy hooks, CLI deploys (`vercel deploy`, `--prod`, `promote`, `redeploy`, `rollback`) and
  deployment APIs are not part of this project's flow. Do not create them. A push to an eligible
  branch is the only deployment trigger.

## Environments and secrets

| Environment | Branch | Supabase | Notes |
| --- | --- | --- | --- |
| Production | `main` | Production project | Production database changes need a separate owner decision |
| Development | `develop` | Same project until an isolated development project exists | Treat development writes as real; do not point this at production data long-term |
| Local | any | Project configured in `.env.local` | Never commit environment values |

Vercel environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `APP_URL`) are configured per environment in the Vercel
project, not committed. `.env.local` is gitignored and never leaves the machine.

## Verification instead of deployment

- CI (`.github/workflows/ci.yml`) gates secret scanning, typecheck, tests and build on every push to
  `main` and `develop`, and on pull requests targeting either branch.
- Deployment configuration is validated statically (`vercel.json`, workflow inspection). Never
  deploy to test the policy.
- After an eligible push, confirm the deployment exists and matches the pushed commit; that is
  observation of an automatic side effect, not a manual deploy.
