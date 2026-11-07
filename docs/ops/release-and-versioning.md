# Release and versioning

## Scheme

Semantic versioning, `MAJOR.MINOR.PATCH`, in `package.json` (`version`).

- **MAJOR** — only after public release; pre-release stays `0`.
- **MINOR** — one increment per production release, i.e. per phase exit (P4 → `0.2.0`,
  P5 → `0.3.0`, …). The phase number and the version number are deliberately independent.
- **PATCH** — fixes released between phase exits (`0.2.1`).

The version is surfaced at runtime by `GET /api/v1/health` (`version` field, injected from
`package.json` through `next.config.js`) so a deployment can be identified without reading git.

## Tags

- Tag format `vX.Y.Z` (annotated), created **on `main` only**, on the commit that is promoted to
  production.
- The tag is the release record: it must point at a commit that passed the phase gate.
- `staging` and `develop` are never tagged.

## Per-phase release procedure

1. Task branches are merged into `develop`; CI green on `develop`.
2. Run the phase gate (`docs/roadmap/phases-gates.md`) and record evidence in `docs/roadmap/PLAN.md`.
3. Bump `version` in `package.json`, move `CHANGELOG.md` "Unreleased" entries under the new version,
   commit as `chore(release): vX.Y.Z` on `develop`.
4. Merge `develop` → `staging`, push, let the preview deployment build, verify the deployed commit.
5. Merge `staging` → `main`, push (production deployment), then
   `git tag -a vX.Y.Z -m "P<N> <name>"` and push the tag.
6. Record the release in `docs/roadmap/PLAN.md` (phase, version, tag, deployed commit, gate results).

## Changelog

`CHANGELOG.md` follows Keep a Changelog. Entries are written as work lands on `develop`, under
`## [Unreleased]`, and promoted to a version heading at release time.
