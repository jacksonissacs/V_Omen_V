# Implementation handoff — OMEN landing (for Cursor)

## What you're getting
A dependency-free static prototype: `index.html` + `css/{tokens,site,spectrum}.css` + `js/{spectrum,demo-data,site}.js` + `assets/`. Open `index.html` directly or serve the folder; no build step. `reference-footer.html` is the isolated reference section kept for comparison.

## Porting order
1. **Tokens** — copy `css/tokens.css` (or `docs/tokens.json`) into the design system first; the product prototype already uses the same names, so nothing should be renamed. Keep `--silver-*` for brand only and `--ac` (indigo) for functional UI only.
2. **`spectrum.js`** — port as-is into a `<SpectrumStage>` component. Public surface: `OmenSpectrum.mount(el, {staticTime, pitch})` → `{pause(), play(), toggle(), renderAt(t), paused, reduced}` and a `spectrum:state` CustomEvent on the root. Keep the loop time-based and the seed fixed; do not add pointer or scroll coupling — neither was in the reference. Tunables and their measured targets are commented at the top of the file and in `docs/01-reference-observations.md`.
3. **`EventCard`** — `renderCard(root, {idx, step})` in `site.js` is the single source of truth for the preview, the walkthrough and the rewind. Port it to a component with props `{event, series, evidence, archive, idx, mode}` and keep the derivations (movement, evidence visibility, future mask) in one place. Chart is plain SVG built from `series`; keep `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke`.
4. **Sections** — Pulse, Archive, Ledger fragments are simple maps over `OMEN_DEMO`. Replace `demo-data.js` with a typed fixture; keep the shape.
5. **Request access** — the `<dialog>` validates and shows a success state but sends nothing. Wire `#access-form` submit to the real intake; keep the invalid/success states and the focus return.
6. **Footer social slots** — placeholders. Swap the three glyphs for the approved icon set and real URLs; keep `.glass-btn` sizing (34 px).

## Do-not-change list
- `assets/omen-symbol.png` is the approved logo, unchanged. Render with `object-fit: contain`, height only; never stretch, recolor, or add a drop shadow.
- Probability typography: IBM Plex Mono, `font-feature-settings: 'tnum' 1`, one decimal, decimal + % de-emphasised at 0.5em.
- Demo labelling: every product fragment carries the "Demo — illustrative data, not live" chip; the hero and footer restate it. Keep this until real data replaces the fixtures.
- Pause control must remain on every continuous animation; reduced-motion must render a static frame with opt-in play.

## Accessibility contract (already met; keep it)
- All interactive elements are native (`button`, `a`, `input[type=range]`, `details`, `dialog`); focus ring is `1.5px var(--border-focus)`.
- Step tabs: `role=tablist/tab`, roving `tabindex`, arrow keys. Slider: `aria-valuetext`. Motion toggles: `aria-pressed` + `aria-controls`. Mobile nav: `aria-expanded`, Escape closes.
- Stages are `role="img"` with an `aria-label`; canvases are `aria-hidden`.
- No scroll hijacking: anchors use `scrollIntoView`, `auto` under reduced motion.

## Responsive behaviour
- Two-column sections stack ≤ 980 px; mobile nav and single-column readout ≤ 720 px.
- `EventCard` stacks main/side when its **container** is ≤ 720 px (container query on `.panel`), so it works in the narrow walkthrough column at desktop widths too.
- Spectrum stage heights: hero `clamp(300px, 34vw, 440px)`, footer `clamp(380px, 54vw, 640px)`; mobile footer `clamp(300px, 90vw, 420px)`.

## Verification used
Playwright (Chromium) at 1440×900 and 390×844 (DPR 2, touch): no console errors; walkthrough via keyboard (ArrowDown ×2 selects step 3, slider ArrowLeft updates readout); dialog invalid → valid → done; `prefers-reduced-motion` → both stages paused with `raf = 0`; footer off-screen → not animating. Screenshots in `screenshots/`.

## Open items for the product team
- Real social URLs and icon set.
- Intake endpoint for Request access.
- Privacy / Terms pages.
- Decide whether the API FAQ answer stands (currently phrased as a plan, not a feature).
