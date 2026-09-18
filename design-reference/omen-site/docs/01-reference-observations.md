# Reference recording — observations and reconstruction notes

Source: `Screen_Recording_2026-09-13_at_9_26_31_PM.mov` — 1118×646, 60 fps, 24.28 s, 1451 frames.
Inspected with ffmpeg frame extraction (1 fps contact sheet, 5–20 fps bursts) and per-pixel analysis.

## What the footage shows (verified)

| Observation | Measurement | Reconstruction |
|---|---|---|
| Template viewer chrome | Left "←" button; right sidebar "Spectrum Grid / Technology / 12 likes / Go Unlimited" (x ≥ 878 px) | Excluded. Section under review is the 868×472 area plus the footer rows below it. |
| Horizontal hue progression | Sampled at y≈40–160: 0%→hue 15° (orange-red), 10%→355°, 20%→300°, 30%→255°, 40%→238°, 50%→222°, 60%→203°, 70%→193°, 78%→168°, 83%→134°, 88%→65°, 95%→57° (yellow). Blue occupies ~45% of width; green is narrow. Saturation 0.65–0.80 on the red/violet side, 0.9–0.98 in blue/cyan, ~0.65 in yellow | Piecewise-linear hue and saturation stops (`HUE_STOPS`, `SAT_STOPS` in `spectrum.js`) |
| Luminous vertical columns | Soft bands 6–56 px wide separated by dark seams; brightest in blue and cyan; no horizontal drift over 24 s (cross-correlation shift = 0) | Static multi-octave value noise for band placement; brightness modulated in time only |
| Dotted grid | Regular grid, ≈12 px pitch, dots ≈4–5 px; whole columns of dots appear/disappear in clusters; per-cell variation is mild; dots read dark on the red→blue side and bright on the cyan→yellow side; grid does not scroll | 12 px pitch; column-gated presence (sparser left, denser right); lightness 0.34 → 0.70 across width; column-led shimmer |
| Soft glow | Bright bands and dots have wide halos | Two down/up-scale bloom passes (columns) + one for dots, additive |
| Irregular light trails / fade to black | Mean luminance: 108 at top, 89 at 40% height, 50 at 60%, 16 at 80%, 8 at 93%. Individual columns fade at different heights | Per-column trail start (22–56% height) + global fade + bottom gradient |
| Motion character | Smooth (frame-to-frame Δ ≈ 1.6/255), decorrelates within ~1 s, **loops with period ≈ 6.9 s** (near-identical frames at 6.9 s, 13.85 s, 20.75 s) | Seamless 7 s loop via noise sampled on a circle in time; identical output for identical `t` |
| Footer chrome | Three square dark-glass social buttons bottom-left inside the atmosphere; hairline rule; wordmark left, four links + square "Back to top" right; second rule; © line + Privacy / Terms | Same structure with OMEN branding |

## What was *not* observed (so not implemented)

- **No pointer-reactive behaviour.** The system cursor appears in a few frames (around 10 s and 15 s) with no corresponding change in the field. Nothing in this reconstruction responds to the pointer.
- **No scroll-linked behaviour.** The viewer never scrolls during the recording, so scroll effects cannot be verified; none are added.
- **No entrance / reveal animation** could be verified — the recording starts with the section already animating.

## Known gaps in the reconstruction (honest list)

1. **Fade depth.** The reference keeps faint colour deeper into the bottom third (≈16/255 at 80% height vs ≈6 here). The reference trails are also thinner (2–4 px lines reaching down) where mine are wider and softer. Tunable via `gFade`, `cFade` and the bottom gradient in `renderAt()`.
2. **Band micro-structure.** The reference has occasional very thin (2–3 px) bright lines inside broad bands (e.g. a pink line at ≈13% width). The 1/3-resolution column layer smooths those out; rendering at full width would recover them at ~3× the pixel cost.
3. **Exact noise field.** The original is almost certainly a different generator (probably a WebGL/shader template). Band *positions* here are deterministic but not the same positions as the footage; colour distribution, density and rhythm are matched, not the pixel layout.
4. **Social icons.** The reference uses Instagram / LinkedIn / X glyphs. These are placeholders with neutral glyphs until the approved icon set and URLs exist.
5. **Loop length** is 7.0 s; the measured period was ≈6.9 s (sampling limited to 0.05 s).

## Controls

- Pause / Play button (bottom-right of the atmosphere) — keyboard: Tab to it, Space/Enter toggles; `aria-pressed` reflects state.
- `prefers-reduced-motion: reduce` → one static frame at t = 1.7 s, no animation loop, a short note explains why; the button becomes an opt-in "Play motion".
- Animation also pauses when the section is off-screen (IntersectionObserver) and when the tab is hidden.
- Frame rate is capped at 30 fps; the loop is time-based, so pausing/resuming never jumps.
