# Deployment governance

Status: active from 2026-11-09. Owner-reviewed for production changes.

This document is the deployment authority for Prism Pass. It defines which branches may deploy, how a
change reaches production, and which parts of the policy are enforced in the repository versus in
GitHub or Vercel settings.

## Eligible branches

Only two branches may deploy automatically:

| Branch | Role | Automatic deployment |
| --- | --- | --- |
| `main` | Production | Yes — production |
| `develop` | Integration | Yes — development |
| `staging` | Not used for deployment | **No** |
| `feat/*`, `fix/*`, `chore/*`, `agent/*`, `dependabot/*` | Task work | No |
| Pull-request merge refs and previews | Review only | No |

Everything not named `main` or `develop` is ineligible, including pull-request previews.

### Why `staging` is excluded

- There is no isolated staging Vercel project or Supabase project. The earlier three-branch note in
  `docs/ops/branching-and-deployment.md` records that a preview would share the production Supabase
  project, so a "preview" write would be a real production write.
- Deployment eligibility is limited to `main` and `develop`. A staging deployment would need a
  separate owner decision, an isolated environment and data, and an update to this document and
  `vercel.json`.
- The 2026-11-08 three-branch note (`main` + `staging`) was superseded by the owner on 2026-11-09.
  `docs/ops/branching-and-deployment.md`, `docs/ops/release-and-versioning.md` and the `README.md`
  branch table now describe the `main` + `develop` model; `staging` is retired and is neither
  promoted to nor deployed.

## Enforcement in `vercel.json`

```json
"git": {
  "deploymentEnabled": {
    "*": false,
    "**": false,
    "main": true,
    "develop": true
  }
}
```

- Vercel refuses an automatic Git deployment for every branch not explicitly set to `true`, before a
  build starts. This includes pull-request previews.
- `"**"` is required because a single `*` does not match branch names containing `/`.
- `vercel.json` does **not** control deployments created with the Vercel CLI or API. Those are governed
  by the policy below and by platform access controls.
- Vercel loads configuration in a platform-defined way. The allowlist must be present on the branch
  Vercel reads for the project. Until this change is promoted to `main`, the platform may still honour
  the previous allowlist. Verify the first eligible deployment after promotion; never create an
  ineligible deployment to test the policy.

## Deployment rules

1. **Automatic Git deployments only.** A push to `main` or `develop` is the only normal deployment
   trigger.
2. **No duplicate manual deployments.** Do not run `vercel deploy`, `vercel --prod`, `vercel promote`,
   `vercel redeploy` or `vercel rollback` after an automatic deployment for the same commit. A rollback
   is a production-impacting operation and needs explicit owner authorization.
3. **No deploy hooks or deployment APIs.** Do not create or invoke them. They bypass `vercel.json` and
   are not part of this project's flow.
4. **No preview deployments from task branches or pull requests.** Build and verify locally instead.
5. **`develop` is pre-authorized.** Its automatic deployment is the normal integration feedback loop.
   Until an isolated development Supabase project exists, `develop` deployments point at the same
   project as production — treat development writes as real data.
6. **`main` is production and owner-authorized.** An agent promotes to `main` only when the owner
   explicitly instructs that specific production deployment. The instruction authorizes that
   deployment, not future ones.
7. **Production database migrations are separate.** A `main` deployment does not authorize a
   production migration. Development migrations are applied against the verified development target;
   production migrations need a separate owner decision.

## Promotion flow

```
task branch ──PR──> develop ──automatic deploy──> verify
                       │
                       └──PR (owner authorization)──> main ──automatic deploy──> production
```

1. Open a pull request from the task branch into `develop`. The CI check named
   **`typecheck / test / build`** must pass.
2. Merge into `develop`. The push triggers the automatic development deployment. Verify the deployed
   commit and the relevant flows.
3. Open a pull request from `develop` into `main` when the phase gate is satisfied. The same CI check
   must pass, the diff must be reviewed, and the owner must authorize the production promotion.
4. Merge into `main`. The push triggers the automatic production deployment. Tag the promoted commit
   only as part of the release procedure (`docs/ops/release-and-versioning.md`).
5. Never force-push, rewrite history, or delete `main` or `develop`.

The repository currently allows direct merges into `develop` and has no branch protection. The flow
above is the target state; the GitHub settings in the next section are required to enforce it.

## Required GitHub settings (not enforceable from repository code)

These are GitHub settings, not files in the repository. They were verified absent on 2026-11-09:
`GET /repos/J-Akiru5/prism-pass/branches/main/protection` and the same path for `develop` both returned
`404 Branch not protected`.

Configure branch protection rules or rulesets for **both** `main` and `develop`:

- Require a pull request before merging. This is what makes the CI result a gate rather than a
  notification.
- Require the status check **`typecheck / test / build`** (the `name` of the `verify` job in
  `.github/workflows/ci.yml`). If the job is renamed, update the protected check to the new name.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Require conversation resolution.
- Require review from a code owner or the owner where the account model allows it. GitHub does not let
  an author approve their own pull request, so a solo-maintained repository may need to require a pull
  request with zero approvals and keep the owner as the only merger.
- Restrict who can push to `main`. Keep admin bypass available only for an explicitly owner-authorized
  production deployment.
- Set the repository's default GitHub Actions token permissions to read-only. This workflow already
  declares `permissions: contents: read`.

Vercel project settings to verify separately:

- Production branch is `main`.
- The Git integration is the only deployment pathway; no deploy hooks exist.
- Environment variables are scoped per environment in Vercel; no real values are committed.
- Preview deployments are disabled by the `vercel.json` allowlist for every branch except `main` and
  `develop`.

## What is enforceable where

| Rule | Mechanism | Strength |
| --- | --- | --- |
| Only `main`/`develop` auto-deploy | `vercel.json` `git.deploymentEnabled` | **Platform-enforced** after the config is on the branch Vercel reads |
| CI runs typecheck, tests, secret scan, build | `.github/workflows/ci.yml` | **Repository-enforced** on the configured events |
| CI must pass before merge | Branch protection / ruleset | GitHub setting — currently absent |
| No direct pushes / force pushes | Branch protection / ruleset | GitHub setting — currently absent |
| No manual CLI/API deploys | Policy plus Vercel token/access control | **Policy-only** in this repository |
| `main` requires owner authorization | Review + owner merge | Policy and review setting |
| No production migrations without owner decision | Policy plus credential control | **Policy-only** in this repository |

`vercel.json` cannot restrict CLI/API deployments. If an account with deployment access runs
`vercel deploy`, the allowlist does not apply. Treat Vercel access as production access.

## CI gate and build environment

`.github/workflows/ci.yml` runs on pull requests targeting `main` or `develop` and on pushes to those
branches. It uses Node 22 (matching `package.json` `engines` and `.nvmrc`), pnpm 10.33.3 through
Corepack, a frozen lockfile, and a pnpm store cache.

Steps: install, production dependency audit (non-blocking), blocking secret scan, Prisma client
generation, typecheck, tests, build. The job timeout is 20 minutes.

The build uses **placeholder values only**:

```
NEXT_TELEMETRY_DISABLED=1
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-placeholder
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/prism_pass
```

CI does not connect to Supabase or a database and never receives a real service-role key. The build
succeeds without a live database because DB-backed pages are force-dynamic or request-scoped. This is
supported by successful CI runs at the current tree before this change: run `42543827383` on `main`
and run `42543662712` on `develop` at `7fbf668`, both green through the Build step. The workflow itself
is validated statically; this change does not run or deploy it.

## Verification checklist

- [x] `vercel.json` allowlists only `main` and `develop`; `*` and `**` are false; schema retained.
- [x] CI workflow removes the `staging` trigger and keeps pull requests plus `main`/`develop` pushes.
- [x] `.nvmrc` pins Node 22.
- [x] Workflow YAML and `vercel.json` parsed statically.
- [ ] Branch protection/rulesets configured for `main` and `develop` (GitHub setting, owner action).
- [ ] Required status check `typecheck / test / build` selected in the ruleset.
- [ ] Vercel project settings and absence of deploy hooks verified in the dashboard.
- [x] `docs/ops/branching-and-deployment.md`, `docs/ops/release-and-versioning.md` and `README.md`
      reconciled with this document (2026-11-09).
