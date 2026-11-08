# Secret scanning and dependency audit (P9)

## Local commands

```bash
pnpm security:secrets       # scan git-tracked files (what CI runs)
pnpm security:secrets:all   # scan the working tree, including untracked files
pnpm audit:prod             # production dependency advisories
```

The scanner also supports:

```bash
node scripts/security/scan-secrets.mjs --json   # machine-readable findings
node scripts/security/scan-secrets.mjs --help
```

Exit codes: `0` clean, `1` potential secret, `2` scanner error. Findings print file, 1-based line
and column, rule id and a **redacted** preview (the full credential is never printed).

Before sending a branch for review, run `pnpm security:secrets:all`; the CI step only sees tracked
files.

## CI behaviour

In `.github/workflows/ci.yml`:

- **Secret scan — blocking.** The repository is clean today, so a finding is a real regression.
- **`pnpm audit --prod` — non-blocking-loud** (`continue-on-error: true`) while the dependency tree
  is stabilised. It still appears as a failed step with the advisory table in the log. Promote it to
  blocking once the report is triaged and clean; do not silence it by deleting the step.

## What the scanner detects

- PEM private key blocks.
- AWS access key ids (`AKIA…`, `ASIA…`).
- GitHub classic and fine-grained tokens.
- Stripe secret keys and OpenAI-style `sk-…` keys.
- Supabase secret keys (`sb_secret_…`).
- `SUPABASE_SERVICE_ROLE_KEY` assignments with a concrete value.
- Decoded JWT payloads carrying the service_role claim.
- Postgres URLs with an inline password.

Placeholders (`placeholder`, `example`, `redacted`, `dummy`, `sample`, `your-`, `xxx`,
`test-only`, `changeme`) and local database URLs (`localhost`, `127.0.0.1`, `db`, and the common
`postgres`/`password` local passwords) are ignored.

## Exclusions

The scanner skips `.git/`, `node_modules/`, `.next/`, `dist/`, `coverage/`, `screenshots/`, its own
source (`scripts/security/`), lockfiles, binary extensions, and files larger than 1 MiB.

## Limitations

- Regex-only: no entropy scoring, so a random-looking secret in an unexpected format can pass.
- No git-history scan. Removing a secret from the working tree does not remove it from history; a
  leaked credential must be rotated regardless.
- It scans text, not dependencies or container images.
- A tracked `.env` file would be scanned; an untracked local `.env.local` is only scanned with
  `--all` (and never committed).
- The patterns live in `scripts/security/secret-scan.mjs`; changing them can hide a finding. Treat
  pattern changes as security-review changes.

## On a finding

1. Rotate/revoke the credential first; assume it is compromised even if the branch is deleted.
2. Remove it from the working tree and from git history (history rewrite is a Tier C operation —
   get owner approval).
3. Re-run `pnpm security:secrets:all`.
4. Record the incident and the rotation in the handoff notes.
