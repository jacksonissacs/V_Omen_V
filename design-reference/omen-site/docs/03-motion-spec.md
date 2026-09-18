# Motion specification

Principle: one atmospheric effect, everywhere else motion only answers a user action. No scroll-linked animation, no scroll hijacking, no entrance reveals.

## 1. Spectrum field (hero `#hero-spectrum`, footer `#spectrum`)

| Property | Value |
|---|---|
| Source | `js/spectrum.js`, Canvas 2D, no dependencies |
| Loop | 7.0 s, seamless (time is sampled on a circle; frame at t = 7 s equals t = 0). Reference measured ≈ 6.9 s. |
| Frame rate | Capped at 30 fps; time-based, so dropped frames never change the loop |
| Determinism | Seed 1729. Same stage size + same `t` → identical pixels. `renderAt(t)` renders any moment on demand (used for the screenshots). |
| Start | Immediately on mount, at t = 0. No fade-in (none was observed in the footage). |
| Hero static frame | t = 4.2 s (reduced motion) |
| Footer static frame | t = 1.7 s (reduced motion) |
| Character | Bands pulse in place (no horizontal drift, no vertical scroll); dot columns gate on/off in clusters; trail lengths breathe. Frame-to-frame change is small and smooth. |
| Triggers to pause | (a) Pause button → `aria-pressed="true"`; (b) stage < 2 % visible (IntersectionObserver); (c) document hidden; (d) `prefers-reduced-motion: reduce` at load |
| Resume | Play button; stage re-enters viewport; tab visible again. Resumes from the paused `t`, no jump. |
| Reduced motion | Static frame, `paused = true`, `raf = 0`. A one-line note explains why; the toggle reads "Play motion" so motion is opt-in, not forbidden. |
| Resize | ResizeObserver rebuilds buffers and re-renders the current `t` (no restart). |
| Cost | Column field at 1/3 resolution (≈ 0.2 MP at 1440×600) + ≈ 3–5 k dots per frame. Two stages never run at once in practice because at most one is on screen. |

Not reproduced from the footage (see `01-reference-observations.md`): thinner 2–3 px trails and slightly deeper residual colour in the bottom third.

## 2. Walkthrough card (`#walk-card`)

| Event | Motion |
|---|---|
| Step change (click / arrow keys) | Card re-renders in place. No transition; content swap is instant so the step buttons stay in sync with keyboard focus. Step button background/border: 120 ms. |
| Evidence rows entering "future" state | Opacity 200 ms `--ease` (steps 1–2 dim to 0.28; step 3 hides). |
| Rewind slider | Native `<input type="range">`; card re-renders on every `input` event (pointer drag, touch, arrow keys, Home/End). No easing between values — the probability must read as data, not animation. |
| Chart | Re-drawn SVG per render; future region masked, cursor line shown in step 3. |

## 3. Interface micro-motion

| Element | Duration / easing |
|---|---|
| Button background / border | 120 ms |
| Link colour | 120 ms |
| FAQ plus → close indicator | 200 ms `cubic-bezier(.3,.7,.4,1)` rotation; panel open/close is the native `<details>` (instant) |
| Mobile nav | Instant show/hide (`.open`) |
| Dialog | Native `<dialog>` open/close; backdrop blur, no animation |
| In-page anchors | `scrollIntoView({behavior:'smooth'})`; `auto` under reduced motion. Never intercepts wheel or touch scrolling. |

## 4. Reduced-motion matrix

| `prefers-reduced-motion: reduce` | Behaviour |
|---|---|
| Spectrum stages | Static frame, opt-in play |
| Smooth scrolling | Off |
| Transitions | Left at ≤ 200 ms (they respond to direct input); set `--t-fast/--t-med` to `0ms` in a media query if a stricter policy is wanted |
