# Accessibility & UX-consistency audit — shared surfaces

**Branch:** `feat/a11y-pass` (based on `develop` @ `3360fb1`)
**Date:** 2026-11-08
**Scope:** `components/app-shell.tsx`, `components/console-bar.tsx`, `components/page-header.tsx`,
`components/ui/*`, `components/ui-states.tsx`, `components/data-table.tsx`,
`components/confirmation-dialog.tsx`, `components/theme-toggle.tsx`,
`app/(auth)/login/page.tsx`, `app/(organization)/org/[orgId]/{people,passes,attendance}/page.tsx`,
`app/(platform)/platform/*`, `app/not-found.tsx`.
The platform ledger component (`components/platform/org-ledger.tsx`) was treated as part of the
platform surface because the in-scope platform page renders it directly.

## Method and honest limits

- **Static source inspection only.** No browser, dev server, build, database or screen reader was
  available in this worktree, and no automated axe/Lighthouse/Playwright run was performed.
- Focus order was derived from DOM order and landmark structure; it was not observed live.
- Contrast ratios were **computed from the HSL design tokens** in `app/globals.css` using the WCAG
  2.x relative-luminance formula, including alpha compositing where a token is used as `/10` or
  `/20`. They are token maths, not sampled pixels.
- Dynamic announcements were reviewed by locating `role="status"` / `role="alert"` / `aria-live`
  in source; no assistive-technology output was observed.
- Anything that would need a real render (focus ring pixel contrast, reflow at 320 px, 200 % zoom,
  screen-reader virtual cursor behaviour, actual Tab sequence) is called out as **not verified**.

Severity: **Critical** (blocks a task for keyboard/AT users) · **High** (task is possible but
unreliable or WCAG A/AA failure) · **Medium** (friction / AA risk) · **Low** (polish, AAA,
consistency) · **Info** (verified-good note).

## Summary

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| F1 | High | Focus visibility | `Button` removed the global outline without a replacement | Fixed (`6e72cbb`) |
| F2 | High | Focus visibility | `Input` removed the outline, keeping only a 30 % gold ring | Fixed (`6e72cbb`) |
| F3 | Medium | Focus visibility | Platform status `<select>` copied the same outline removal | Fixed (`6e72cbb`) |
| F4 | High | Dialog | No initial focus, focus trap, or focus restore | Fixed (`b8e1baf`) |
| F5 | Medium | Dialog | Escape/scrim could close while a mutation was running | Fixed (`b8e1baf`) |
| F6 | Medium | Keyboard semantics | Session picker claimed `listbox`/`option` without arrow-key support | Fixed (`b86935a`) |
| H1 | High | Headings | Login rendered two `<h1>` elements in the DOM | Fixed (`6d9114b`) |
| H2 | High | Headings | Passes page rendered a second `<h1>` for the ID-card panel | Fixed (`42f6b77`) |
| H3 | Medium | Headings | `CardTitle` was always `h3`, skipping `h2` under the page `h1` | Fixed (`6d9114b`) |
| H4 | Medium | Headings | Dialog title was `h3` in an independent modal tree | Fixed (`b8e1baf`) |
| E1 | High | Forms | Hints/errors were not associated with their control; no `aria-invalid` | Fixed (`6d9114b`) |
| E2 | Medium | Forms | Login's form-level failure was announced but not associated | Fixed (`6d9114b`) |
| E3 | Low | Forms | Required marker was an `aria-hidden` asterisk only | Fixed (`6d9114b`) |
| T1 | High | Tables | People table had a blank `<th>` for its action column | Fixed (`b86935a`) |
| T2 | Medium | Tables | Repeated row actions had no row context ("Open", "Rotate", …) | Fixed (`b86935a`) |
| T3 | Medium | Tables | Horizontally scrollable tables were not keyboard-reachable | Fixed (`b86935a`) |
| C1 | Medium | Contrast | Success badge text was 4.26:1 on its own tint (AA needs 4.5) | Fixed (`6e72cbb`) |
| C2 | High | Contrast | The only remaining focus halo was 2.42:1 on paper | Fixed (`6e72cbb`) |
| S1 | Low | Announcements | Member-detail change and create-policy/session success are silent | Left |
| S2 | Low | Announcements | Search match count was not announced | Fixed (`b86935a`) |
| TT1 | Low | Touch targets | Header controls are 36 px and sidebar links ~40 px (< 44 px AAA) | Accepted |
| SK1 | Medium | Skip links | Platform console had no skip link | Fixed (`b86935a`) |
| SK2 | Low | Skip links | Standalone console bar pages have no skip link | Left (out of scope) |
| UX1 | Medium | Consistency | Ledger `<select>` had bespoke focus styling | Fixed (`6e72cbb`) |
| UX2 | Low | Consistency | Pass table "Person" column shows a truncated person id | Left |
| UX3 | Low | Consistency | Platform nav has no `aria-current` | Left |

## 1. Focus order and landmarks

**Checked:** skip link → chrome → main order in `app-shell.tsx`, DOM order on login, platform and
404, landmark names, `main` focus target.

- `app-shell.tsx:28-33` — skip link targets `#main-content`; `app-shell.tsx:120` — `<main
  id="main-content" tabIndex={-1}>`. Focus order is skip → sidebar → header controls → main →
  mobile nav, which is DOM order. **OK.**
- `app-shell.tsx:35` `<aside>` (implicit complementary), `:47` `<nav aria-label="Portal sections">`,
  `:92` `<header>`, `:123` `<nav aria-label="Primary">` for mobile. Landmarks are uniquely named.
  **OK.**
- `app/(platform)/platform/layout.tsx:4-27` — the platform console had **no skip link** (SK1,
  Medium). Fixed by adding the same focus-revealed skip link (`:7-12`) and a `#platform-main`
  target on both branches (`app/(platform)/platform/page.tsx:19`,
  `components/platform/org-ledger.tsx:154`). Focus is programmatic (`tabIndex={-1}`).
- `app/not-found.tsx:7` and `app/(auth)/login/page.tsx:101` each expose a single `<main>`. **OK.**
- `components/console-bar.tsx:13` is a `<header>` only; it does not create a landmark conflict.
  The standalone console pages own their `<main>` and are out of this pass (SK2, Low).

## 2. Focus visibility

The global rule in `app/globals.css:109-113` paints a 3 px navy outline (`--ring`, 14.6:1 on card)
plus a gold halo. Three components suppressed it:

- **F1 (High, fixed `6e72cbb`)** `components/ui/button.tsx:10-11` — the base variant contained
  `focus-visible:outline-none`. Because utilities outrank the zero-specificity `:where()` global
  rule, only the gold halo remained; `--accent` is **2.42:1 on white** and **2.19:1 on paper**, so
  the primary interactive control was below the 3:1 non-text requirement. Removal restores the
  navy outline.
- **F2 (High, fixed `6e72cbb`)** `components/ui/input.tsx:17` — `focus:outline-none` plus
  `focus:ring-2 focus:ring-accent/30` (≈1.4:1 tinted ring) replaced the outline with a colour-only
  change. Replaced with `focus:border-accent`, leaving the global outline for keyboard users.
- **F3 (Medium, fixed `6e72cbb`)** `components/platform/org-ledger.tsx:195` — same pattern on the
  status filter; aligned with `Input` (UX1).
- **C2 (High, fixed)** the underlying contrast failure is the gold halo itself. It remains as a
  decorative second layer; the 3 px `--ring` outline is now the actual indicator everywhere.
- Links, native buttons and the skip links rely on the same global rule. No `outline-none`
  remains in scoped files (verified by grep; `app/demo/page.tsx:161,176` still has it but is
  outside this pass and is recorded below).

## 3. Heading hierarchy

One `<h1>` per page, no skipped levels:

| Surface | Before | After |
|---------|--------|-------|
| `app/(auth)/login/page.tsx` | Two `h1`s (`:62` brand statement, `:104` mobile title) | brand statement and mobile title are `<p>`; the card title is the single `h1` (`:109`) |
| `app/(organization)/…/people/page.tsx` | `h1` + `h3` cards (skipped `h2`) | `h1` → `h2` cards (`:121`, `:159`, `:221`) → `h3` subsections (`:184`, `:202`) |
| `app/(organization)/…/passes/page.tsx` | two `h1`s (page + ID card) | page `h1`; ID-card panel is `h2` (`:100`) |
| `app/(organization)/…/attendance/page.tsx` | `h1` + `h3` cards | `h1` → `h2` cards (`:120`, `:145`, `:180`) |
| `app/(platform)/platform/*` | `h1` already correct | unchanged (`org-ledger.tsx:155-165`, platform page `:21`) |
| `app/not-found.tsx` | `h1` correct | unchanged (`:12`) |

- **H1/H2 (High, fixed)** duplicate `h1`s above. The login page technically hid one per breakpoint,
  but both were always in the DOM; the passes ID-card panel produced two visible `h1`s at once.
- **H3 (Medium, fixed `6d9114b`)** `components/ui/card.tsx:17-22` — `CardTitle` defaulted to `h3`.
  It now defaults to `h2` and accepts `as="h1" | "h2" | "h3" | "h4"`. Cards sit directly under the
  page `h1`, so `h2` is the correct level. `components/ui/form-field.tsx` and dialogs are unaffected.
- **H4 (Medium, fixed `b8e1baf`)** `components/confirmation-dialog.tsx:95` — title is now `h2`,
  starting a fresh heading tree inside the modal rather than jumping to `h3`.

## 4. Contrast

Computed from `app/globals.css` tokens (WCAG 2.x relative luminance; alpha composited):

| Pair | Ratio | Requirement | Verdict |
|------|-------|-------------|---------|
| `muted-foreground` on `background` / `card` | 5.43 / 6.00 | 4.5 | Pass |
| `gold-dark` eyebrow on `background` / `card` | 5.21 / 5.76 | 4.5 | Pass |
| `destructive` on card / own `/10` tint | 6.36 / 5.47 | 4.5 | Pass |
| `info` on card / own `/10` tint | 9.16 / 7.77 | 4.5 | Pass |
| `success` on card (old 37 %) | 4.84 | 4.5 | Pass |
| `success` on own `/10` tint (old 37 %) | **4.26** | 4.5 | **Fail (C1)** |
| `success` on own `/10` tint (new 34 %) | 4.85 | 4.5 | Pass |
| `--ring` on card / paper | 14.60 / 13.21 | 3.0 (non-text) | Pass |
| `--accent` gold halo on card / paper | **2.42 / 2.19** | 3.0 (non-text) | **Fail alone (C2)** |
| sidebar `text-white/60` / `/70` | 6.88 / 8.94 | 4.5 | Pass |
| sidebar `gold-soft` | 11.71 | 4.5 | Pass |
| dark `muted-foreground` on dark card | 7.93 | 4.5 | Pass |

- **C1 (Medium, fixed `6e72cbb`)** `app/globals.css:37` — `--success` moved from 37 % to 34 %
  lightness. Success badges (`components/ui/badge.tsx:12`) are 12 px text on `bg-success/10` and
  now clear AA. This is a shared token change; it also improves the scan-result text and status
  icons. The dark-theme token was already 8.66:1 and is unchanged.
- **C2 (High, fixed)** the halo is decorative, not the sole indicator (see §2).
- Muted small print on `bg-muted/50` is 5.42:1. Placeholder text uses
  `muted-foreground` and is 6.0:1 on card.

## 5. Form labelling and error announcement

- **E1 (High, fixed `6d9114b`)** `components/ui/form-field.tsx:25-55` — the wrapper rendered hint
  and error text as unrelated siblings. It now clones its single control and applies
  `aria-describedby` (merging any existing value), sets `aria-invalid` when an error exists, and
  keeps `role="alert"` on the error. `htmlFor`/`id` stay stable, and `useId()` covers callers that
  omit `htmlFor`.
- **E2 (Medium, fixed)** `app/(auth)/login/page.tsx:113-127` — the form-level "Sign in failed"
  alert now has `id="login-error"` and is referenced by the form via `aria-describedby`. Field
  errors ("Enter your email address", "Password is required") are linked by `FormField`.
- **E3 (Low, fixed)** required fields now read "… (required)" in addition to the visual asterisk
  (`form-field.tsx:46-50`); the asterisk stays `aria-hidden`.
- **Labelled controls verified:** login (`login/page.tsx:114-119`), people search and add form
  (`people/page.tsx:127`, `:150-151`), program form (`:230-236`), assignment form (`:195`, `:199`),
  attendance policy/session/scan forms (`attendance/page.tsx:135-137`, `:165-169`, `:185`), platform
  search/status (`org-ledger.tsx:170-181`, `:188-201`).
- **E4 (Low, left)** people and attendance render mutation errors only in the page-level
  `ErrorState` (`people/page.tsx:116`, `attendance/page.tsx:113`), not beside the field that failed.
  The alert is announced (`role="alert"`), but the API does not return field-level errors, so a
  per-field association would be guesswork. Left deliberately.

## 6. Table semantics

- **T1 (High, fixed `b86935a`)** `app/(organization)/…/people/page.tsx:133` passed `""` as the last
  column, producing an empty `<th>`. `components/data-table.tsx:10-31` now accepts
  `{ label, srOnly }`; the column is `{ label: "Actions", srOnly: true }`, so sighted users keep the
  clean header while AT hears a name.
- **T2 (Medium, fixed)** row actions now include their row: `people/page.tsx:144` (`Open {name}`),
  `passes/page.tsx:86-88` (`ID card / Rotate / Revoke {passPublicId}`). Previously every row
  exposed the same three accessible names.
- **T3 (Medium, fixed)** `components/data-table.tsx:17-23` — the `overflow-x-auto` wrapper is now a
  named `role="region"` with `tabIndex={0}`, so the table can be scrolled with arrow keys (WCAG
  2.1.1). The custom platform table got the same treatment at
  `components/platform/org-ledger.tsx:246-247`. Trade-off: tables add one tab stop even when they
  do not overflow.
- **Verified:** every in-scope table has a `<caption>` (`data-table.tsx:26`, `org-ledger.tsx:248-250`),
  column headers use `scope="col"`, and the ledger row header uses `scope="row"`
  (`org-ledger.tsx:281`). `components/attendance-timeline.tsx` renders status text next to its icon,
  so icon colour is never the only encoding.

## 7. Dialog keyboard behaviour

- **F4 (High, fixed `b8e1baf`)** `components/confirmation-dialog.tsx:32-76`:
  - stores the trigger, moves focus to **Cancel** first (least destructive), and restores focus on
    unmount if the element is still connected;
  - traps `Tab`/`Shift+Tab` inside the panel, including the empty-focusable fallback;
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby` all use `useId()`
    (`:85-90`), so two dialogs can never share ids.
- **F5 (Medium, fixed)** Escape and scrim clicks are ignored while `busy` (`:45-51`, `:81`), so a
  request cannot be dismissed mid-flight.
- **Accepted limitation:** the background is not `inert`/`aria-hidden`. Focus cannot escape, but a
  screen reader's virtual cursor may still reach content behind the modal. Fully isolating the
  background would require a portal plus `inert` and is a larger architectural change; left for a
  follow-up. This is a real residual gap, not a "fixed" item.

## 8. State encoding and consistency

- Status is never colour-only: badges contain text (`badge.tsx:8-17`; e.g. `people/page.tsx:143`,
  `passes/page.tsx:83`, `org-ledger.tsx:286`), attendance pairs an icon with the status badge
  (`attendance-timeline.tsx:31-34`), active navigation uses `aria-current` plus a bar
  (`app-shell.tsx:55`, `:141`), and the session picker exposes `aria-pressed`
  (`attendance/page.tsx:153`). **OK.**
- **F6 (Medium, fixed `b86935a`)** `attendance/page.tsx:150-158` previously declared
  `role="listbox"`/`role="option"` on plain buttons with no roving tabindex or arrow-key handling —
  a screen reader promises interaction the widget does not provide. It is now a normal labelled
  list of toggle buttons; selection survives keyboard and touch identically.
- **UX2 (Low, left)** `passes/page.tsx:81` — the "Person" column shows `personId.slice(0,8)…`, not a
  person name. That is a data-availability issue, not mark-up; changing the visible label would
  need the API to return names.
- **UX3 (Low, left)** `app/(platform)/platform/layout.tsx:21-24` — "Overview" has no
  `aria-current`. The layout is a server component; adding pathname-aware state would force it
  client-side for little gain. Left.

## 9. Skip links, touch targets, motion, announcements

- **Skip links:** org shell (`app-shell.tsx:28-33`), platform (`layout.tsx:7-12`) and the marketing
  root (`app/page.tsx:24-30`) are present and focus-revealed. Login/404 are single-column pages with
  no repeated navigation, so no skip link is needed (Info). Standalone consoles (SK2, Low) are out
  of scope.
- **Touch targets (TT1, Low, accepted):** `app-shell.tsx:107` and `:114` and
  `theme-toggle.tsx:19` are 36 px square; sidebar links are ~40 px. This clears WCAG 2.2 AA
  (24 px minimum) but not the 44 px AAA target. The mobile bottom nav is already `min-h-11`
  (44 px, `app-shell.tsx:143`). Left as-is to avoid restyling the header rhythm.
- **Reduced motion:** `app/globals.css:127-141` reduces animation/transition to 0.01 ms, forces one
  iteration and neutralises framer-motion inline transforms via `[data-motion]`. **OK.**
- **Announcements:**
  - `ui-states.tsx:6` loading `role="status"`, `:26` error `role="alert"`, `:31` retry button;
  - `login/page.tsx:121-127` sign-in failure `role="alert"` + `aria-describedby`;
  - `people/page.tsx:129` search match count `role="status"` (S2, fixed) and `:179` one-time
    credential `role="status"`;
  - `passes/page.tsx:66` rotate/revoke outcome `role="status"`;
  - `attendance/page.tsx:188` scan outcome `role="status"`;
  - `org-ledger.tsx:217-220` mutation outcome `role="status"`, `:318` page position `aria-live`.
  - **S1 (Low, left):** opening a member (`people/page.tsx:157-161`) and creating a policy/session
    (`attendance/page.tsx:67-91`) update the DOM without a live message. These are visible changes
    the user initiated; adding a politely-announced confirmation is a reasonable follow-up but
    would add copy, so it was not invented here.

## 10. Component API changes and call sites

| Component | Change | Call sites |
|-----------|--------|------------|
| `components/ui/card.tsx` `CardTitle` | optional `as` prop; default `h2` (was `h3`) | login uses `as="h1"` (`login/page.tsx:109`). All other call sites compile unchanged and now emit `h2`: people `121/159/221`, passes `70`, attendance `120/145/180`, settings `72`, demo `113`. |
| `components/page-header.tsx` `PageHeader` | optional `as` prop; default `h1` | passes ID-card panel uses `as="h2"` (`passes/page.tsx:100`). All other call sites unchanged. |
| `components/data-table.tsx` `DataTable` | `columns` widened to `Array<string \| { label: string; srOnly?: boolean }>`; wrapper is a named focusable region | people uses the object form (`people/page.tsx:133`); passes/attendance unchanged. |
| `components/ui/form-field.tsx` `FormField` | now a client component; same props; auto-links hint/error and sets `aria-invalid` | Unchanged call sites, all in client pages: login, demo, people, attendance, reports. No server-component usage exists. |
| `components/confirmation-dialog.tsx` | same props; focus management added | passes `117`, org-ledger `344` unchanged. |
| `app/globals.css` | `--success` 37 % → 34 % lightness | Shared token; affects every success text/badge. |

No call sites were missed; the only external consumers are out-of-scope pages that keep the same
prop signatures (heading level is the only semantic change they inherit, and it is an improvement).

## 11. Verification

Run from the worktree root:

```
pnpm prisma:generate   # restores the generated client in a fresh worktree; pre-existing requirement
pnpm typecheck         # exit 0
pnpm test              # 14 files, 139 tests passed
```

Notes:
- `pnpm typecheck` fails in a fresh worktree *before* `prisma:generate` with missing
  `@prisma/client` exports; that is pre-existing and unrelated to these changes. After generating,
  it is green.
- `pnpm` reports an engine warning: the host runs Node `v24.14.0` while `package.json` asks for
  `22.x`. Tests and typecheck still pass; the warning is environmental, not caused by this branch.
- No `next build`, dev server, DB, browser or deployment was run, per the task constraints.

## 12. Deliberately not changed

- `app/(scanner)/scan/page.tsx`, `app/(organization)/org/[orgId]/page.tsx`, `.../reports`,
  `.../settings`, `components/brand/*`, `modules/*` — owned by other agents.
- `app/demo/page.tsx:161,176` still uses `outline-none` with a 30 % gold ring (same defect as F2).
  The page is outside the assigned surface; the shared `FormField` change still links its errors.
- `app/page.tsx` and the marketing components were not audited beyond the shared tokens.
- `components/console-bar.tsx` has no skip link because its pages (scanner/member) own their `<main>`
  and are out of scope.
- `components/digital-pass-card.tsx` was read for context (status badges are text-labelled) but not
  edited; it is not in the assigned list.
- Visual restyling was avoided; all changes are semantics, focus, labelling or token contrast.
