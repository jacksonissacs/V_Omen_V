/**
 * OMEN Spectrum — port of `design-reference/omen-site/js/spectrum.js`.
 *
 * The visual algorithm (hue/saturation profile, 4-D looping value noise, band,
 * dot and bloom layers, fixed seed, 7 s period, 30 fps cap) is preserved
 * verbatim. What this port adds is lifecycle management so the effect can be
 * mounted from React:
 *
 *  - `destroy()` cancels the animation frame, disconnects observers and
 *    removes every listener; late frames after destroy are ignored.
 *  - A single loop guard (`raf`) plus the `destroyed` flag prevents duplicate
 *    loops across React development remounts.
 *  - The loop never (re)starts while the document is hidden.
 *  - `prefers-reduced-motion` is honoured at mount and when the preference
 *    changes; a manual pause is preserved across visibility changes.
 *  - `create()` returns `null` when a 2D context cannot be obtained so the
 *    caller can render a static fallback.
 */

export const PERIOD = 7 // seconds per loop (measured ≈6.9 s in reference)
const SEED = 1729
const FPS_CAP = 30
const LOWRES = 3 // column layer rendered at 1/3 resolution, upscaled (= soft blur)
const PITCH = 12 // dot grid pitch in CSS px (measured ≈12 px)
const TAU = Math.PI * 2

/* ---------- hue / saturation profile sampled from the recording ---------- */
const HUE_STOPS: [number, number][] = [
  [0.0, 15], [0.1, -5], [0.2, -60], [0.3, -105], [0.4, -122], [0.5, -138],
  [0.6, -157], [0.7, -167], [0.78, -192], [0.83, -226], [0.88, -295], [0.95, -303], [1.0, -305],
]
const SAT_STOPS: [number, number][] = [
  [0, 0.8], [0.12, 0.74], [0.22, 0.68], [0.32, 0.74], [0.5, 0.86], [0.62, 0.86], [0.74, 0.84], [0.82, 0.7], [0.9, 0.64], [1, 0.66],
]

function stops(arr: [number, number][], u: number): number {
  if (u <= arr[0][0]) return arr[0][1]
  for (let i = 1; i < arr.length; i++) {
    if (u <= arr[i][0]) {
      const a = arr[i - 1]
      const b = arr[i]
      const t = (u - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * t
    }
  }
  return arr[arr.length - 1][1]
}

export function hueAt(u: number): number {
  const h = stops(HUE_STOPS, u) % 360
  return h < 0 ? h + 360 : h
}

export function satAt(u: number): number {
  return stops(SAT_STOPS, u)
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}

/* ---------- deterministic value noise ---------- */
function hash(x: number, y: number, z: number, w: number): number {
  let h =
    Math.imul(x | 0, 0x8da6b343) ^
    Math.imul(y | 0, 0xd8163841) ^
    Math.imul(z | 0, 0xcb1ab31f) ^
    Math.imul(w | 0, 0x165667b1) ^
    SEED
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
const sm = (t: number) => t * t * (3 - 2 * t)
function smooth(a: number, b: number, x: number): number {
  let t = (x - a) / (b - a)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 4-D value noise: (x, y) spatial, (z, w) = point on a circle so time loops seamlessly
function noise4(x: number, y: number, z: number, w: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const iw = Math.floor(w)
  const fx = sm(x - ix)
  const fy = sm(y - iy)
  const fz = sm(z - iz)
  const fw = sm(w - iw)
  let r = 0
  for (let dw = 0; dw < 2; dw++) {
    const ww = dw ? fw : 1 - fw
    for (let dz = 0; dz < 2; dz++) {
      const wz = ww * (dz ? fz : 1 - fz)
      const v00 = hash(ix, iy, iz + dz, iw + dw)
      const v10 = hash(ix + 1, iy, iz + dz, iw + dw)
      const v01 = hash(ix, iy + 1, iz + dz, iw + dw)
      const v11 = hash(ix + 1, iy + 1, iz + dz, iw + dw)
      r += wz * lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy)
    }
  }
  return r
}
const noise2 = (x: number, y: number) => noise4(x, y, 0.5, 0.5)

/* ---------- effect ---------- */

export interface SpectrumOptions {
  /** Loop time (s) rendered as the static frame under reduced motion. */
  staticTime?: number
  pitch?: number
  /** Called whenever the paused / reduced state changes. */
  onState?: (state: SpectrumState) => void
}

export interface SpectrumState {
  paused: boolean
  reduced: boolean
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

export class Spectrum {
  readonly root: HTMLElement
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly low: HTMLCanvasElement
  private readonly glowA: HTMLCanvasElement
  private readonly glowB: HTMLCanvasElement
  private readonly dots: HTMLCanvasElement
  private readonly dotGlow: HTMLCanvasElement
  private readonly pitch: number
  private readonly staticTime: number
  private readonly onState?: (state: SpectrumState) => void

  /** Paused by the user (or by reduced motion). Visibility never changes this. */
  paused = false
  /** The OS/browser currently prefers reduced motion. */
  reduced = false
  /** Stage intersects the viewport. */
  private visible = true
  /** Seconds into the loop. */
  elapsed = 0
  private lastNow = 0
  private lastFrame = 0
  private raf = 0
  private destroyed = false

  private resizeObserver: ResizeObserver | null = null
  private intersectionObserver: IntersectionObserver | null = null
  private media: MediaQueryList | null = null
  private img!: ImageData

  private W = 1
  private H = 1
  private W2 = 1
  private H2 = 1
  private dpr = 1
  private base!: Float32Array
  private bandStatic!: Float32Array
  private bright!: Float32Array
  private lift!: Float32Array
  private trail!: Float32Array
  private cols = 0
  private rows = 0
  private dotHue!: Float32Array
  private dotSat!: Float32Array
  private dotL!: Float32Array
  private dotCol!: Float32Array

  /**
   * Create and start the effect. Returns `null` if a 2D context is not
   * available (jsdom, blocked canvas, etc.) so the caller can fall back.
   */
  static create(root: HTMLElement, canvas: HTMLCanvasElement, opts: SpectrumOptions = {}): Spectrum | null {
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext("2d", { alpha: false })
    } catch {
      ctx = null
    }
    if (!ctx || typeof ctx.createImageData !== "function") return null
    try {
      return new Spectrum(root, canvas, ctx, opts)
    } catch {
      return null
    }
  }

  private constructor(root: HTMLElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, opts: SpectrumOptions) {
    this.root = root
    this.canvas = canvas
    this.ctx = ctx
    this.pitch = opts.pitch ?? PITCH
    this.staticTime = opts.staticTime ?? 1.7
    this.onState = opts.onState
    this.canvas.setAttribute("aria-hidden", "true")
    this.low = document.createElement("canvas")
    this.glowA = document.createElement("canvas")
    this.glowB = document.createElement("canvas")
    this.dots = document.createElement("canvas")
    this.dotGlow = document.createElement("canvas")

    this.media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_QUERY) : null
    this.reduced = this.media?.matches ?? false

    this.resize()

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.handleResize)
      this.resizeObserver.observe(root)
    } else {
      window.addEventListener("resize", this.handleResize)
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(this.handleIntersect, { threshold: 0.02 })
      this.intersectionObserver.observe(root)
    }
    document.addEventListener("visibilitychange", this.handleVisibility)
    this.media?.addEventListener?.("change", this.handleMediaChange)

    if (this.reduced) {
      // static frame; user can opt in via play()
      this.paused = true
      this.renderAt(this.staticTime)
    } else {
      this.loop()
    }
  }

  /* ---------- lifecycle ---------- */

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stop()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = null
    window.removeEventListener("resize", this.handleResize)
    document.removeEventListener("visibilitychange", this.handleVisibility)
    this.media?.removeEventListener?.("change", this.handleMediaChange)
    this.media = null
  }

  get running(): boolean {
    return this.raf !== 0
  }

  private handleResize = (): void => {
    if (this.destroyed) return
    this.resize()
    this.renderAt(this.elapsed)
  }

  private handleIntersect = (entries: IntersectionObserverEntry[]): void => {
    if (this.destroyed) return
    this.visible = entries[0]?.isIntersecting ?? true
    if (this.visible) this.loop()
    else this.stop()
  }

  private handleVisibility = (): void => {
    if (this.destroyed) return
    // Only the frame loop reacts; `paused` (a user decision) is untouched.
    if (document.hidden) this.stop()
    else this.loop()
  }

  private handleMediaChange = (event: MediaQueryListEvent): void => {
    if (this.destroyed) return
    this.reduced = event.matches
    if (this.reduced) {
      // Preference now asks for stillness: stop and show the static frame.
      this.paused = true
      this.stop()
      this.renderAt(this.staticTime)
    } else {
      // Preference lifted: resume; motion is the default again.
      this.paused = false
      this.loop()
    }
    this.emit()
  }

  private emit(): void {
    this.onState?.({ paused: this.paused, reduced: this.reduced })
  }

  /* ---------- controls ---------- */

  pause(): void {
    this.paused = true
    this.stop()
    this.emit()
  }

  play(): void {
    this.paused = false
    this.loop()
    this.emit()
  }

  toggle(): boolean {
    if (this.paused) this.play()
    else this.pause()
    return this.paused
  }

  private loop(): void {
    if (this.raf || this.paused || !this.visible || this.destroyed) return
    if (typeof document !== "undefined" && document.hidden) return
    this.lastNow = performance.now()
    const frame = (now: number) => {
      this.raf = 0
      if (this.destroyed || this.paused || !this.visible || document.hidden) return
      const dt = (now - this.lastNow) / 1000
      this.lastNow = now
      this.elapsed = (this.elapsed + Math.min(dt, 0.1)) % PERIOD
      if (now - this.lastFrame >= 1000 / FPS_CAP - 2) {
        this.lastFrame = now
        this.renderAt(this.elapsed)
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /* ---------- geometry ---------- */

  resize(): void {
    const r = this.root.getBoundingClientRect()
    this.W = Math.max(1, Math.round(r.width))
    this.H = Math.max(1, Math.round(r.height))
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = this.W * this.dpr
    this.canvas.height = this.H * this.dpr
    this.canvas.style.width = `${this.W}px`
    this.canvas.style.height = `${this.H}px`
    this.W2 = Math.ceil(this.W / LOWRES)
    this.H2 = Math.ceil(this.H / LOWRES)
    this.low.width = this.W2
    this.low.height = this.H2
    this.img = this.lowCtx().createImageData(this.W2, this.H2)
    this.glowA.width = Math.max(2, Math.round(this.W / 10))
    this.glowA.height = Math.max(2, Math.round(this.H / 10))
    this.glowB.width = Math.max(2, Math.round(this.W / 28))
    this.glowB.height = Math.max(2, Math.round(this.H / 28))
    this.dots.width = this.W * this.dpr
    this.dots.height = this.H * this.dpr
    this.dotGlow.width = Math.max(2, Math.round(this.W / 7))
    this.dotGlow.height = Math.max(2, Math.round(this.H / 7))

    // per-column static data (colour + band skeleton)
    const n = this.W2
    this.base = new Float32Array(n * 3)
    this.bandStatic = new Float32Array(n)
    this.bright = new Float32Array(n)
    this.lift = new Float32Array(n)
    this.trail = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * LOWRES
      const u = x / this.W
      const rgb = hsl2rgb(hueAt(u), satAt(u), 0.52)
      this.base[i * 3] = rgb[0]
      this.base[i * 3 + 1] = rgb[1]
      this.base[i * 3 + 2] = rgb[2]
      const s1 = noise2(x / 18, 2.5)
      const s2 = noise2(x / 60, 9.5)
      const s3 = noise2(x / 7, 4.25)
      this.bandStatic[i] = 0.5 * s1 + 0.38 * s2 + 0.12 * s3
    }
    // dot-grid geometry
    this.cols = Math.ceil(this.W / this.pitch) + 1
    this.rows = Math.ceil(this.H / this.pitch) + 1
    this.dotHue = new Float32Array(this.cols)
    this.dotSat = new Float32Array(this.cols)
    this.dotL = new Float32Array(this.cols)
    this.dotCol = new Float32Array(this.cols)
    for (let c = 0; c < this.cols; c++) {
      const ux = (c * this.pitch + this.pitch / 2) / this.W
      this.dotHue[c] = hueAt(ux)
      this.dotSat[c] = satAt(ux)
      this.dotL[c] = lerp(0.34, 0.7, smooth(0.58, 0.76, ux)) // dark dots on blue, bright on green/yellow
      this.dotCol[c] = noise2(c * 0.09, 8.5) > 0.3 ? 1 : 0 // slow column clusters
    }
  }

  private lowCtx(): CanvasRenderingContext2D {
    const ctx = this.low.getContext("2d")
    if (!ctx) throw new Error("2D context unavailable")
    return ctx
  }

  private ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2D context unavailable")
    return ctx
  }

  /* ---------- render ---------- */

  /** Render the loop at time t (seconds, any value; wraps on PERIOD). */
  renderAt(time: number): void {
    const t = ((time % PERIOD) + PERIOD) % PERIOD
    this.elapsed = t
    const ph = (TAU * t) / PERIOD
    const cz = 2.5 + Math.cos(ph)
    const cw = 2.5 + Math.sin(ph)
    const W = this.W
    const H = this.H
    const W2 = this.W2
    const H2 = this.H2
    const data = this.img.data
    const n = W2

    /* --- column layer --- */
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * LOWRES
      const mod = noise4(x / 26, 5.5, cz * 1.15, cw * 1.15)
      let b = this.bandStatic[i] * (0.62 + 0.85 * mod)
      b = smooth(0.18, 0.82, b)
      this.bright[i] = 0.24 + 0.9 * b
      this.lift[i] = Math.max(0, b - 0.9) * 0.14
      this.trail[i] = 0.22 + 0.34 * noise4(x / 38, 12.5, cz * 0.6, cw * 0.6)
    }
    // coarse vertical streak field, sampled every 6 low-res rows
    const sr = Math.ceil(H2 / 6) + 1
    const streak = new Float32Array(n * sr)
    for (let j = 0; j < sr; j++) {
      const yy = j * 6 * LOWRES
      for (let i = 0; i < n; i++) {
        streak[j * n + i] = 0.84 + 0.32 * (noise4((i * LOWRES) / 7, yy / 70, cz * 0.8 + 3, cw * 0.8) - 0.5)
      }
    }
    let p = 0
    for (let y = 0; y < H2; y++) {
      const v = (y + 0.5) / H2
      const gFade = 1 - smooth(0.34, 1.0, v) * 0.9
      const sj = y / 6
      const sj0 = Math.floor(sj)
      const sjt = sj - sj0
      const row0 = sj0 * n
      const row1 = Math.min(sj0 + 1, sr - 1) * n
      for (let i = 0; i < n; i++) {
        const ts = this.trail[i]
        const cFade = 1 - smooth(ts, ts + 0.55, v) * 0.8
        const s = lerp(streak[row0 + i], streak[row1 + i], sjt)
        const k = this.bright[i] * cFade * gFade * s
        const l = this.lift[i] * cFade * gFade
        const r = this.base[i * 3] * k + l
        const g = this.base[i * 3 + 1] * k + l
        const bb = this.base[i * 3 + 2] * k + l
        data[p] = r > 1 ? 255 : r * 255
        data[p + 1] = g > 1 ? 255 : g * 255
        data[p + 2] = bb > 1 ? 255 : bb * 255
        data[p + 3] = 255
        p += 4
      }
    }
    this.lowCtx().putImageData(this.img, 0, 0)

    /* --- dot layer --- */
    const dc = this.ctx2d(this.dots)
    dc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    dc.clearRect(0, 0, W, H)
    const pitch = this.pitch
    for (let c = 0; c < this.cols; c++) {
      if (!this.dotCol[c]) continue
      const colGate = noise4(c * 0.42, 1.5, cz * 0.7 + 7, cw * 0.7)
      const colGate2 = noise4(c * 0.6, 3.5, cz * 1.1 + 5, cw * 1.1)
      const xd = c * pitch + pitch / 2
      const uc = xd / W
      if (colGate < lerp(0.36, 0.14, smooth(0.3, 0.7, uc))) continue // sparse dots on the left, dense on the right
      const li = Math.min(n - 1, Math.floor(xd / LOWRES))
      const brightCol = this.bright[li]
      const tsd = this.trail[li]
      const hue = this.dotHue[c]
      const sat = this.dotSat[c] * 100
      const Lb = this.dotL[c]
      for (let rr = 0; rr < this.rows; rr++) {
        const yd = rr * pitch + pitch / 2
        const vd = yd / H
        if (hash(c, rr, 99, 1) < 0.1) continue // permanently missing cells
        const f = 0.65 * colGate2 + 0.35 * noise4(c * 0.35, rr * 0.28, cz * 1.3 + 11, cw * 1.3) // column-led shimmer + gentle per-cell variation
        const vis = smooth(0.3, 0.7, f)
        const a =
          (0.3 + 0.7 * vis) *
          (1 - smooth(tsd - 0.08, tsd + 0.34, vd)) *
          (1 - smooth(0.4, 0.72, vd)) *
          (0.45 + 0.55 * brightCol) *
          lerp(0.7, 1, smooth(0.48, 0.72, uc))
        if (a < 0.03) continue
        const L = Lb + 0.16 * (f - 0.5)
        dc.fillStyle = `hsla(${hue},${sat}%,${L * 100}%,${a})`
        const rad = 1.9 + 0.6 * vis
        dc.beginPath()
        dc.arc(xd, yd, rad, 0, TAU)
        dc.fill()
      }
    }

    /* --- composite --- */
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, W, H)
    ctx.drawImage(this.low, 0, 0, W, H)
    // bloom: downscale then upscale = cheap wide blur
    const ga = this.ctx2d(this.glowA)
    ga.drawImage(this.low, 0, 0, this.glowA.width, this.glowA.height)
    const gb = this.ctx2d(this.glowB)
    gb.drawImage(this.glowA, 0, 0, this.glowB.width, this.glowB.height)
    ctx.globalCompositeOperation = "lighter"
    ctx.globalAlpha = 0.16
    ctx.drawImage(this.glowA, 0, 0, W, H)
    ctx.globalAlpha = 0.13
    ctx.drawImage(this.glowB, 0, 0, W, H)
    // dots + their halo
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    ctx.drawImage(this.dots, 0, 0, W, H)
    const dg = this.ctx2d(this.dotGlow)
    dg.clearRect(0, 0, this.dotGlow.width, this.dotGlow.height)
    dg.drawImage(this.dots, 0, 0, this.dotGlow.width, this.dotGlow.height)
    ctx.globalCompositeOperation = "lighter"
    ctx.globalAlpha = 0.45
    ctx.drawImage(this.dotGlow, 0, 0, W, H)
    // guarantee true black at the bottom
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    const grad = ctx.createLinearGradient(0, H * 0.72, 0, H)
    grad.addColorStop(0, "rgba(0,0,0,0)")
    grad.addColorStop(1, "rgba(0,0,0,.8)")
    ctx.fillStyle = grad
    ctx.fillRect(0, H * 0.72, W, H * 0.28)
  }
}

/**
 * CSS gradient approximating the horizontal hue progression, used as the
 * static fallback when Canvas 2D is unavailable.
 */
export function fallbackGradient(): string {
  const stops: string[] = []
  for (let i = 0; i <= 10; i++) {
    const u = i / 10
    stops.push(`hsl(${hueAt(u).toFixed(0)} ${(satAt(u) * 100).toFixed(0)}% 42%) ${(u * 100).toFixed(0)}%`)
  }
  return `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.35) 45%, #000 92%), linear-gradient(90deg, ${stops.join(", ")})`
}
