# OMEN landing page — design reference

This folder holds the Fable design handoff for the public OMEN landing page at `/`
and records how it was integrated into this repository.

**Status: implemented.** The landing lives at `src/app/(marketing)/` with components
in `src/components/marketing/` and the effect/fixtures in `src/lib/marketing/`.

## Contents

| Path | What it is |
|---|---|
| `omen-site/index.html` | Complete visual and content reference (static prototype). |
| `omen-site/reference-footer.html` | Isolated rainbow-footer reconstruction (review checkpoint). |
| `omen-site/css/{tokens,site,spectrum}.css` | Prototype tokens, page and spectrum styling. |
| `omen-site/js/spectrum.js` | Original Canvas 2D effect (ported to `src/lib/marketing/spectrum.ts`). |
| `omen-site/js/demo-data.js`, `js/site.js` | Deterministic fixtures and page behaviour (ported to typed fixtures + React). |
| `omen-site/assets/omen-symbol.png` | Approved silver symbol, 1024², unchanged. Copied to `public/brand/omen-symbol.png`. |
| `omen-site/assets/fonts/` | Inter / IBM Plex Mono woff2. **Not used** — the app already loads both via `next/font`. |
| `omen-site/screenshots/` | Fable's desktop/mobile targets, state captures and reference comparisons. |
| `omen-site/docs/` | Reference observations, copy, motion spec, interaction states, handoff. |
| `omen-site/logo-pack/` | `web_ready/` icons from the OMEN logo asset pack (favicon, touch icon, app icons). |
| `implemented/` | Screenshots of the shipped page (Chromium via `next start`): 1440 hero/full/reduced-motion/footer/walkthrough, 390 hero/full/menu, workspace `/pulse`. |

The prototype is reference material; the project decisions below override it where they conflict.

## Product decisions (confirmed)

1. **Brand.** OMEN is the public name. The supplied silver symbol is used unchanged
   (height-only sizing, `object-fit: contain`, never recoloured). All user-visible
   "AION" copy and metadata now say OMEN. Internal identifiers (`AionMark`, `.aion-app`,
   `--a-*`, `AionEvent`, package name `aion`) are unchanged on purpose.
2. **Routes.** Public landing at `/` in the `(marketing)` route group. The workspace home
   moved from `/` to `/pulse` (`src/app/(workspace)/pulse/page.tsx`); every other workspace
   route is unchanged (`/graph` still redirects to `/relations`). Marketing branding links
   to `/`; the workspace sidebar logo links to `/pulse`.
3. **Access.** There is no signup or intake backend. Every primary CTA is
   **"Explore the demo" → `/pulse`**; the secondary in-page action is
   **"See how it works" → `#walkthrough`**. The access dialog, its handlers, validation and
   simulated "request noted" state were removed. The workspace top bar carries a
   "Demo data" chip.
4. **Styling.** Marketing styles are scoped under `.omen-marketing`
   (`src/app/(marketing)/marketing.css`) with `--m-*` tokens mapped from the prototype's
   `tokens.css`. No prototype `html/body/button` resets or generic token names were added
   globally; the workspace's `.aion-app` tokens are untouched. Fonts reuse the root layout's
   `--font-inter` / `--font-ibm-plex-mono`.
5. **Design.** Fable's layout, typography, silver branding, rainbow palette, dotted light
   field, product cards and responsive composition are preserved. Deviations are listed below.

## Content corrections applied

| Prototype | Shipped |
|---|---|
| "Request access" (top bar, hero, final CTA) opening a `<dialog>` | "Explore the demo" → `/pulse` |
| Hero/final secondary "Explore the demo" → `#demo` | "See how it works" → `#walkthrough` |
| Hero note "The demo below uses illustrative data…" | "…The demo below and the workspace it opens use illustrative data…" |
| FAQ "Is there an API?" — "Request access and say what you would build…" | "Not yet. Programmatic access is part of the product plan. The demo workspace includes a small read-only JSON view of the same illustrative catalog…" |
| FAQ "How do I get access?" — "Access is by request… we read every request." | "There is no signup yet. The workspace is open as a demo with illustrative data…" |
| Final CTA "Early access is open to a small number of teams… we'll be in touch." | "The workspace is open as a demo. Every figure in it is illustrative and reproducible…" |
| Footer: three placeholder social buttons, `mailto:hello@example.invalid`, Privacy / Terms → `#` | Removed. No destinations invented. |

## Implementation deviations from the prototype (intentional)

- **Point-in-time cutoff.** The prototype displayed `HH:MM:00` but filtered evidence through
  `HH:MM:59`, so up to 59 s of future evidence could appear in a rewound view (e.g. at 14:34
  the 14:34:16 item). `cutoffAt()` now defines the instant as `HH:MM:00` and both the label
  and `isEvidenceVisible()` use it. Covered by `src/lib/marketing/demo-data.test.ts`.
- **Motion toggle accessibility.** The prototype put `role="img"` on the whole stage, which
  makes the pause button inside it presentational for assistive tech. `role="img"` is now on an
  inner `.spectrum-field` wrapper; the toggle sits outside it.
- **Pulse rows ≤ 720 px.** The prototype's single-row figures (`prob → move → σ`) overflowed
  the panel at 390 px and 320 px. The row now wraps (`flex-wrap`, `min-width: 0`).
- **Anchors.** Smooth scrolling uses CSS (`html:has(.omen-marketing) { scroll-behavior }`,
  `auto` under reduced motion) instead of a click handler, and sections carry
  `scroll-margin-top: 64px` so the sticky header does not cover headings.
- **Focus ring.** The prototype changed `border-radius` on `:focus-visible`; only the outline
  is applied so buttons keep their shape.
- **Marker id.** The relations diagram's SVG marker is `#omen-flow-arrow` to avoid a generic
  `#arrow` id on the page.

## Spectrum port (`src/lib/marketing/spectrum.ts`)

The visual algorithm is verbatim: hue/saturation stops, 4-D looping value noise, seed 1729,
7 s period, 30 fps cap, 1/3-resolution column layer, bloom, dot grid, bottom fade. Static
frames: hero t = 4.2 s, footer t = 1.7 s. Added lifecycle management:

- `destroy()` cancels the frame, disconnects Resize/IntersectionObservers, removes the
  `visibilitychange` and `matchMedia` listeners; late frames after destroy are ignored.
- Single loop guard (`raf` + `destroyed`) — no duplicate loops across dev remounts.
- The loop never starts while `document.hidden`; a manual pause survives visibility changes.
- Reduced motion honoured at mount and on preference change (static frame, "Play motion" opt-in).
- `Spectrum.create()` returns `null` without a 2D context → `SpectrumStage` renders a static
  CSS gradient built from the same hue stops.

Known fidelity gaps versus the original recording are unchanged from Fable's notes
(`omen-site/docs/01-reference-observations.md`): softer/wider trails, less residual colour in the
bottom third, different noise positions. Any reference-fidelity tuning should be a separate,
documented change to `renderAt()` (`gFade`, `cFade`, bottom gradient).

## Verification performed

- `npm run lint`, `npx tsc --noEmit`, `npm test` (46 tests, incl. route/active-state, CTA
  destinations, cutoff behaviour, walkthrough keyboard + slider sync, spectrum lifecycle),
  `npm run build`.
- Chromium (Playwright driving local Chrome) against `next start`: 1440, 1024, 980, 768, 390
  (touch) and 320 — no horizontal overflow at any width; keyboard tab/panel behaviour, slider
  keys (arrows/Home/End), FAQ, focus ring, mobile menu (open / Escape → focus toggle / close on
  link), pause/resume, off-screen and hidden-tab stopping, reduced-motion still frame + opt-in,
  navigation `/` → `/pulse` → back (stages unmounted, remounted once, animation resumes),
  workspace routes 200 and `/graph` redirect, no console errors.

## Open items / limitations

- **Contrast.** The muted text token (`--m-tx-2` = `#5E6670`, same value as the workspace's
  `--a-tx-2`) measures **3.2–3.6 : 1** on the graphite surfaces at 11–12.5 px (labels,
  timestamps, table headers, hints, chart axis, legal line). That is below WCAG AA 4.5 : 1.
  Body copy in `--m-tx-1` is 7.2–8.2 : 1. Not changed, to preserve the supplied design;
  raising `--m-tx-2` to about `#7C848E` would clear 4.5 : 1.
- **Missing content (not invented):** footer social profiles and icon set, contact email,
  Privacy and Terms pages, Open Graph image.
- **API FAQ** now states there is no API yet and describes the demo JSON as read-only.
- The workspace still exposes `/api/events` over the mock catalog; the landing does not link to it.
- Chromium only was verified in a browser; Safari/Firefox were not exercised here. The
  slider uses vendor pseudo-elements copied from the prototype for both engines.
