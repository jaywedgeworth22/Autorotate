# Autorotate web design system

Source of truth for the visual language of `apps/web`.  This file documents
the tokens as they exist in code — `apps/web/tailwind.config.js` and
`apps/web/src/index.css` — not an aspirational spec.  If you change either
file, update this document in the same commit (see AR-29 in
`docs/AUDIT-2026-08-26.md`).

All contrast ratios below are computed against the WCAG 2.1 relative-luminance
formula, using the actual `#RRGGBB` values Tailwind resolves each token to.
"AA text" means the 4.5:1 threshold for normal text; "AA large" means the 3:1
threshold for text ≥ 18.66px bold / 24px regular and for non-text UI
components (borders, icons, focus rings).

## 1. Surfaces

| Token | Hex | Role |
|---|---|---|
| `abyss` | `#07090D` | App background (`--background`) |
| `panel` | `#0C0F16` | Sidebar / card surface (`--card`) |
| `raised` | `#11151F` | Popovers, hovered rows, active nav pill (`--popover`) |
| `inset` | `#05070A` | Recessed surfaces — search field, code blocks |
| `line-subtle` | `#1B2130` | Default hairline border (`--border`) |
| `line-strong` | `#2A3247` | Emphasized border (hover, focus adjacency) |

Surfaces are not text colors and are not contrast-checked against each other;
they are checked against the ink tokens that sit on top of them (§2).

## 2. Ink (text) scale

Every ink token below is measured against `abyss` (`#07090D`), the app
background, and against `panel` (`#0C0F16`), the most common surface text
sits on. Both easily clear AA at the ratio recorded for `abyss` — `panel` is
marginally darker-relative and never drops a token below its `abyss` ratio by
more than 0.3:1.

| Token | Hex | vs `abyss` | vs `panel` | AA text (4.5:1) | Use |
|---|---|---|---|---|---|
| `ink-primary` | `#E8ECF4` | 16.83:1 | 16.19:1 | Pass | Headings, primary body copy, active nav |
| `ink-secondary` | `#9AA5B8` | 8.02:1 | 7.71:1 | Pass | Secondary body copy, inactive nav, labels |
| `ink-muted` | `#7C8698` | 5.43:1 | 5.22:1 | Pass | Helper text, table meta, placeholder copy |
| `ink-faint` | `#3A4152` | 1.95:1 | 1.88:1 | **Fail** — decorative only | Separators (`/`, `·`, `→`), status dots, icon fills — never load-bearing text |

`ink-faint` is below even the 3:1 non-text threshold and must never carry a
word, value, or timestamp a user needs to read. It exists for glyphs that are
purely visual dividers between two pieces of real content, or for
already-decorative icon/dot fills.  Every other ink token clears 4.5:1 and is
safe for body text at any size.

**History (AR-24, AR-25 — fixed 2026-08-26):** `ink-muted` shipped at
`#5C6679` (3.45:1, failing AA) while carrying ~259 real text usages, and the
shadcn-mapped `--muted-foreground` CSS variable shipped at `218 15% 48%`
(`#68768D`, 4.33:1) despite its own comment claiming to mirror
`ink-secondary` (`#9AA5B8`, 8.0:1). Both are corrected above/below. 18 of
`ink-faint`'s ~27 usages that were carrying real text (values, "null",
"genesis", timestamps, helper sentences) were moved to `ink-muted`; the
remainder are pure separators/dots and stay on `ink-faint`.

## 3. shadcn CSS variables (`src/index.css`)

The shadcn-derived primitives (`Button`, `Dialog`, `Popover`, …) read HSL
triples from CSS variables rather than the Tailwind color tokens in §2 and
§4. Each variable is commented with the hex + token it is meant to mirror —
keep the HSL numerically equal to that hex, not just visually close, or the
two systems drift apart silently (this is exactly how AR-24 happened).

| Variable | HSL | Hex | Mirrors |
|---|---|---|---|
| `--background` | `222 32% 4%` | `#07090D` | `abyss` |
| `--foreground` | `220 27% 93%` | `#E8ECF4` | `ink-primary` |
| `--card` / `--popover` | `223 29% 7%` / `224 29% 9%` | `#0C0F16` / `#11151F` | `panel` / `raised` |
| `--primary` | `161 79% 54%` | `#2EE6A8` | `spin` |
| `--muted-foreground` | `218 17% 66%` | `#9AA5B8` | `ink-secondary` (8.0:1 — corrected from `218 15% 48%` / `#68768D`, 4.33:1, AR-24) |
| `--destructive` | `352 88% 62%` | `#F4586B` | `danger` |
| `--border` / `--input` | `220 28% 15%` | `#1B2130` | `line-subtle` |
| `--ring` | `161 79% 54%` | `#2EE6A8` | `spin` |

`--sidebar-foreground` (`218 15% 48%`, `#68768D`, 4.33:1) still carries the
same stale value `--muted-foreground` shipped with — it isn't wired to any
rendered sidebar text today (`components/ui/sidebar.tsx` is unused shadcn
scaffolding, see `docs/AUDIT-2026-08-26.md`), but fix it to `218 17% 66%`
before that component is ever wired up.

## 4. Accent vs semantic colors

`spin` is the **brand accent** — the one color used for interactive
affordances, active states, loaders, and the brand mark. It is never reused
to mean "success," even though it happens to read as a green.

| Token | Hex | vs `abyss` | Meaning | Use |
|---|---|---|---|---|
| `spin` | `#2EE6A8` | 12.34:1 | Brand accent | CTAs, active nav rail, focus ring, loader |
| `spin-dim` | `#178A64` | 4.61:1 | Brand accent, low-emphasis | Borders/backgrounds under `spin` content |
| `warn` | `#F5B84C` | 11.24:1 | Semantic — needs attention | Due-soon badges, warning banners |
| `danger` | `#F4586B` | 6.12:1 | Semantic — failure/destructive | Failed runs, delete actions, `--destructive` |
| `info` | `#5EA8FF` | 8.09:1 | Semantic — informational | Info callouts, links inside prose |
| `violet` | `#9B8CFF` | 7.20:1 | Semantic — auxiliary category | Chain/audit accents, secondary data series |

Keeping `spin` out of the semantic set means a component can safely say
"success = `spin`-colored, brand-adjacent" without that meaning changing if a
future palette pass retunes `warn`/`danger`/`info`.

## 5. Radius scale

Named radii key off the single `--radius` CSS variable (`0.625rem` = 10px),
so retuning one number retunes the whole scale:

| Token | Value | Use |
|---|---|---|
| `rounded-xs` | `--radius` − 6px (4px) | Chips, tiny controls |
| `rounded-sm` | `--radius` − 4px (6px) | Inputs, small buttons |
| `rounded-md` | `--radius` − 2px (8px) | Default shadcn controls |
| `rounded-lg` | `--radius` (10px) | Default components |
| `rounded-xl` | `--radius` + 4px (14px) | Larger panels |
| `rounded-chip` | `6px` (fixed) | Badge/chip components |
| `rounded-control` | `10px` (fixed) | Buttons, inputs, nav items |
| `rounded-card` | `14px` (fixed) | Cards, panels |
| `rounded-modal` | `20px` (fixed) | Command palette, dialogs |

The fixed `chip`/`control`/`card`/`modal` tokens are the ones actually used
across hand-built components in `src/components/`; the `xs`–`xl` scale backs
the shadcn primitives in `src/components/ui/`.

## 6. Type scale

Two families carry the interface: `font-display` ("Space Grotesk") for
headings and brand marks, `font-sans` ("Inter") for body copy, `font-mono`
("JetBrains Mono") for values, timestamps, and code.

| Size | Where |
|---|---|
| `72px` / `44px` (`font-display`) | Landing hero `<h1>`, responsive pair (mobile/desktop) |
| `48px` / `30px` (`font-display`) | Section headings |
| `22px` (`font-display`) | Card/panel headings |
| `15px` (body default, `index.css`) | Default body text (`body { font-size: 15px; line-height: 24px }`) |
| `13px` | Nav items, buttons, table cells — the most common UI text size |
| `12px` | Secondary metadata |
| `11px` (`.text-label`, `.text-mono-s`) | Uppercase section labels, mono timestamps/badges |
| `10px` | Rare inline glyphs (e.g. step-timeline placeholders) |

Two utility classes standardize the two most-repeated text treatments
(`src/index.css`):

```css
.text-label { font: 600 11px/16px var(--font-sans); text-transform: uppercase; letter-spacing: 0.08em; }
.text-mono-s { font: 400 11px/16px var(--font-mono); letter-spacing: 0.02em; }
```

## 7. `.tnum` — tabular numerals

```css
.tnum { font-variant-numeric: tabular-nums; }
```

Applied to any numeral that appears in a column or updates in place (KPI
deltas, audit-chain record counts, run durations) so digits don't reflow the
layout as they change width. Not applied globally — only where numbers are
compared vertically or animate.

## 8. Responsive breakpoints

Tailwind defaults (`sm` 640px, `md` 768px, `lg` 1024px). Two places in the
app change structurally at a breakpoint rather than just reflowing:

- **Marketing nav** (`components/Navbar.tsx`) collapses to a slide-in drawer
  below `lg` (1024px).
- **Console shell** (`components/AppShell.tsx`) collapses its fixed `w-60`
  sidebar into a hamburger-triggered overlay drawer below `md` (768px); at
  `md` and above the sidebar is either `w-60` (expanded) or `w-16`
  (collapsed, desktop-only icon rail) and pushes `main` with a matching
  `md:ml-60` / `md:ml-16`. See AR-26 in `docs/AUDIT-2026-08-26.md`.
