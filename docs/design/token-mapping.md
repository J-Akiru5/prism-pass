# Prism Pass token mapping (reference → implementation)

Source truth: `docs/design/extracted-tokens.md`. All values below are adapted,
not copied verbatim; USC/ISUFST identity (logos, copy, navy-heavy public look)
is intentionally NOT carried over. Prism Pass keeps its product identity.

## Files changed
- `app/globals.css` — full semantic token set (light + dark), focus ring,
  `.font-display` (Georgia stack — no network font dependency).
- `tailwind.config.ts` — `navy/*`, `gold/*`, `sidebar/*`, `success/warning/
  info`, `font-display/mono`, shadow scale from tokens.
- `components/ui/*` — `button` (default navy / gold gradient / outline /
  ghost / destructive / link; h-10/8/12/44px touch), `card` (Eyebrow/Title/
  Description/Content/Footer), `badge` (success/warning/info/danger tones
  matching scanner banner), `input` (gold focus ring), `form-field`
  (uppercase navy labels), `avatar` (navy circle, gold-soft initial).
- `components/app-shell.tsx` — deep-navy sidebar, paper header, mobile
  bottom nav, skip link. Replaces the thin top-link org layout.
- `components/{page-header,stat-card,data-table,ui-states,confirmation-dialog,
  scan-result,digital-pass-card,attendance-timeline,theme-toggle}.tsx`
- Removed (superseded, zero imports left): `kpi-card`, `empty-state`,
  `status-badge`, `qr-display` → replaced by `stat-card`/`ui-states`/`badge`/
  `digital-pass-card`. Reuse inventory updated.
- Every screen under `(auth)`, `(organization)`, `(member)`, `(scanner)`
  rewritten on the tokens. No API/business-logic changes.

## Reference → Prism mapping
| Reference (USC Attendance) | Prism Pass token | Notes |
|---|---|---|
| navy-500 `#142850` | `--primary` light `222 60% 20%` | Same hue family, tuned for white-text buttons |
| navy-deep `#0C1B36` | `--sidebar`, scrim `bg-navy-deep/40` | Sidebar stays deep navy in both themes |
| gold-500 `#C9A24B` | `--accent` `41 54% 54%` | CTAs in dark theme, accents + focus halo in light |
| gold-soft `#E4CD8E` | `--gold-soft` | Eyebrows, sidebar labels |
| gold-dark `#8A6D2F` → corrected `#6b5320`-ish | `--gold-dark` | Small warning text on tinted bg (contrast fix, same as reference correction) |
| paper `#F7F5F0` | `--background` light `40 25% 95%` | Warm paper, not pure white |
| panel `#FFFFFF` | `--card` | Cards stay white in light |
| ink `#1B1B1D` | `--foreground` light `240 4% 11%` | |
| line `#DCD6C8` | `--border/--input` light `40 20% 82%` | |
| slate `#5C6773` | `--muted-foreground` light `215 12% 40%` | |
| success `#3F7D5C` → corrected `#2f6048` | `--success` (`152 33% 37%` light / `152 35% 62%` dark) | Both themes carry their own contrast-tuned value |
| danger `#A23E3E` | `--destructive` (`0 45% 44%` / `0 60% 68%` dark) | |
| focus `3px navy + 5px gold halo` | global `:focus-visible` rule | Navy ring light, gold ring dark |
| navy gradient hero + decorative ring | `DigitalPassCard` header, scanner hero | Same composition, Prism copy |
| border-l-4 outcome banner + glyph + label | `ScanResult` (success/warning/info/danger) | Same language, wired to real verify/scan codes |
| `rounded-lg h-10`, `rounded-2xl` modal, `rounded-full` badge | button/input/card/dialog/badge | Same rhythm |
| `text-[10-11px] uppercase tracking-wider` labels | `FormField`, `CardEyebrow`, table headers | |
| avatar navy circle + gold initial | `PersonAvatar` | |
| bottom stamp bar | not copied (USC-specific footer) | Deliberately omitted |

## Dark theme (independently designed)
Deep-navy surfaces (`222 60% 5%` bg, `222 55% 10%` card), gold primary
actions with navy text, lightened success/danger/info for contrast on dark,
sidebar one step darker than cards. Tables keep white/10 dividers via
`--border 222 30% 20%`.
