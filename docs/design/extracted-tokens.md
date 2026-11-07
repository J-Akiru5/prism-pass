# Reference Inspection Report (honest record)

## CICT Attendance original source: NOT LOCATED
Searched the project (`**/*cict*` — no files), the workspace (all of `S:\Dev`,
`S:\Projects`, `S:\`), and sibling checkouts. No CICT-named directory, source
tree, stylesheet, or rendered app exists on this machine. The only CICT
traces are provenance comments and doc mentions inside Prism Pass:

- `components/scanner-viewport.tsx` — interaction adapted from
  `CICT-QR src/components/AdminScanner.jsx` (html5-qrcode, feedback states,
  duplicate guard; data layer replaced, not copied).
- `components/qr-display.tsx` — presentation adapted from OJT-Qr-Pass.
- `docs/implementation/component-reuse-inventory.md` — the reuse table.
- `docs/implementation/dependency-decisions.md` — shared stack notes.

**Nothing below is claimed to be extracted from CICT Attendance.** No tokens,
hex values, or screenshots are fabricated in its name.

## What WAS actually inspected (real sources, real files)

### A. USC Attendance — `S:\Dev\Vue\usc-attendance` (Nuxt 3 + Supabase attendance portal, ISUFST)
`app/assets/css/main.css` (`@theme static`):
- `--font-sans: Inter`, `--font-serif: 'Source Serif 4'`, `--font-mono: 'JetBrains Mono'`
- Navy scale: 50 `#EDF1F8`, 100 `#D6DFF0`, 200 `#ACBEE0`, 300 `#6C8CC4`,
  400 `#1E4A9E`, **500 `#142850` (brand core)**, 600 `#101F42`,
  **700 `#0C1B36` (deep)**, 800 `#081228`, 900 `#050B1A`, 950 `#030712`
- Gold scale: 50 `#FBF7EC`, 100 `#F6EDD3`, 200 `#ECDCA6`, 300 `#E4CD8E`,
  **500 `#C9A24B` (brand core)**, 700 `#8A6D2F` (dark), 900 `#57431E`
- Legacy flat tokens: paper `#F7F5F0`, panel `#FFFFFF`, ink `#1B1B1D`,
  line `#DCD6C8`, slate `#5C6773`, success `#3F7D5C`, danger `#A23E3E`

Patterns observed in source:
- `layouts/dashboard.vue` — `bg-paper` shell, sidebar + header + bottom-nav,
  skip link, focus ring `outline 3px #142850 + 0 0 0 5px #c9a24b` halo,
  portal contrast corrections (success darkened to `#2f6048`, gold-dark to
  `#6b5320` for 12–14px text on tinted backgrounds).
- `layouts/auth.vue` — centered column, logo + serif org name + tracking-widest
  uppercase subline, card slot, help + privacy footer.
- `AppSidebar.vue` — `w-60 bg-navy-deep text-white`, `border-white/10`
  dividers, gold-soft mono eyebrow label, items `rounded-lg px-3 py-2.5
  text-sm font-medium`, active `bg-white/10 text-white`, inactive
  `text-white/75 hover:text-white hover:bg-white/5`, footer org stamp.
- `AppHeader.vue` — `bg-paper-panel border-b border-line`, mobile logo +
  tracking-widest label, bell with danger count badge, navy avatar circle
  (`bg-navy text-gold-soft border-gold`) with initial, dropdown card
  `rounded-xl border-line shadow-lg`, role pill `bg-navy/10 text-navy`,
  modal `rounded-2xl shadow-2xl` with `bg-navy-deep/40 backdrop-blur-sm`
  scrim, labels `text-[10px] font-bold uppercase tracking-wider text-navy`,
  inputs `border-line rounded-lg focus:ring-gold/30 focus:border-gold`.
- `scan.vue` — navy gradient hero (`from-navy-deep via-navy to-navy-light`,
  decorative ring, gold eyebrow), outcome banner
  `rounded-xl border-l-4 px-4 py-4 text-base font-semibold shadow-sm` with
  tone map success→`border-success bg-success/10`,
  warning→`border-gold bg-gold/10 text-navy`,
  info→`border-navy bg-navy/10`, danger→`border-danger bg-danger/10`,
  glyph + bold label + message, day-readable sizes; `min-h-11` touch targets;
  gold bottom stamp bar; event select card; queue card with badge counts.
- `login.vue` — `UCard max-w-sm`, body `p-6 sm:p-8`, centered title +
  muted subtitle, `size="lg"` fields, block primary button, reset link.
- `Button.vue` — variants default(navy)/outline/ghost/destructive/
  gold(gradient `from-gold to-yellow-700`, ink text, `shadow-gold/30`);
  sizes default `h-10 px-4`, sm `h-8 px-3`, lg `h-12 px-6`, icon `h-10 w-10`;
  base `rounded-lg text-sm font-medium transition-colors`.
- `Badge.vue` — `rounded-full px-2.5 py-0.5 text-xs font-semibold`;
  default `bg-navy/10 text-navy`, success `bg-success/10`,
  warning `bg-gold/20 text-gold-dark`, danger `bg-danger/10`.

### B. OptiFeed shared theme — `S:\Dev\Capstone\optifeed\default_shadcn_theme.css`
Standard shadcn token names (`--background/foreground/card/primary/
secondary/muted/accent/destructive/border/input/ring/radius/sidebar/*`,
chart-1..5) in oklch. Confirms Prism Pass's existing token *names* are the
right architecture — only the *values* and component styling need the
enterprise language above.

## Design decision for Prism Pass
Adapt the inspected navy/gold/paper language onto Prism Pass's existing
shadcn-style token names (so `bg-primary`, `bg-card`, etc. gain the
enterprise look with no API/business-logic changes). Prism Pass branding and
product identity are preserved; the visual language is adopted, not the
USC/ISUFST identity (no USC logos, no copied copy).
