/* OMEN Spectrum — reconstruction of the reference footer treatment.
 *
 * Observed in the recording (1118×646 @ 60fps, 24.3 s):
 *  - horizontal hue progression red → magenta → violet → blue → cyan → green → yellow
 *  - luminous vertical bands of varying width with dark seams between them
 *  - a regular dotted grid (≈12 px pitch) whose cells brighten / dim per cell
 *    and whose columns come and go in clusters
 *  - soft bloom around bright bands and dots
 *  - irregular downward light trails, everything fading to black by ≈92 % height
 *  - the whole field loops every ≈6.9 s; no horizontal drift, no vertical scroll
 *  - no pointer-reactive behaviour was observed; none is implemented
 *
 * Deterministic: same seed + same t → same frame. Loops seamlessly on PERIOD.
 */
(function (global) {
  'use strict';

  var PERIOD = 7;          // seconds per loop (measured ≈6.9 s in reference)
  var SEED = 1729;
  var FPS_CAP = 30;        // reference motion is smooth but slow; 30 fps is plenty
  var LOWRES = 3;          // column layer rendered at 1/3 resolution, upscaled (= soft blur)
  var PITCH = 12;          // dot grid pitch in CSS px (measured ≈12 px)
  var TAU = Math.PI * 2;

  /* ---------- hue / saturation profile sampled from the recording ---------- */
  // u (0..1 across width) → hue (degrees, continuous & decreasing so it interpolates cleanly)
  var HUE_STOPS = [
    [0.00, 15], [0.10, -5], [0.20, -60], [0.30, -105], [0.40, -122], [0.50, -138],
    [0.60, -157], [0.70, -167], [0.78, -192], [0.83, -226], [0.88, -295], [0.95, -303], [1.00, -305]
  ];
  var SAT_STOPS = [[0, .80], [.12, .74], [.22, .68], [.32, .74], [.5, .86], [.62, .86], [.74, .84], [.82, .70], [.9, .64], [1, .66]];

  function stops(arr, u) {
    if (u <= arr[0][0]) return arr[0][1];
    for (var i = 1; i < arr.length; i++) {
      if (u <= arr[i][0]) {
        var a = arr[i - 1], b = arr[i], t = (u - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return arr[arr.length - 1][1];
  }
  function hueAt(u) { var h = stops(HUE_STOPS, u) % 360; return h < 0 ? h + 360 : h; }
  function satAt(u) { return stops(SAT_STOPS, u); }

  function hsl2rgb(h, s, l) {
    h /= 360;
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }

  /* ---------- deterministic value noise ---------- */
  function hash(x, y, z, w) {
    var h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^
            Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(w | 0, 0x165667b1) ^ SEED;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function smooth(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // 4-D value noise: (x, y) spatial, (z, w) = point on a circle so time loops seamlessly
  function noise4(x, y, z, w) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), iw = Math.floor(w);
    var fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz), fw = sm(w - iw);
    var r = 0;
    for (var dw = 0; dw < 2; dw++) {
      var ww = dw ? fw : 1 - fw;
      for (var dz = 0; dz < 2; dz++) {
        var wz = ww * (dz ? fz : 1 - fz);
        var v00 = hash(ix, iy, iz + dz, iw + dw), v10 = hash(ix + 1, iy, iz + dz, iw + dw);
        var v01 = hash(ix, iy + 1, iz + dz, iw + dw), v11 = hash(ix + 1, iy + 1, iz + dz, iw + dw);
        r += wz * lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
      }
    }
    return r;
  }
  function noise2(x, y) { return noise4(x, y, 0.5, 0.5); }

  /* ---------- effect ---------- */
  function Spectrum(root, opts) {
    opts = opts || {};
    this.root = root;
    this.pitch = opts.pitch || PITCH;
    this.canvas = root.querySelector('canvas') || root.appendChild(document.createElement('canvas'));
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.low = document.createElement('canvas');   // column field, low-res
    this.glowA = document.createElement('canvas'); // very low-res copies for bloom
    this.glowB = document.createElement('canvas');
    this.dots = document.createElement('canvas');  // dot grid, full-res
    this.dotGlow = document.createElement('canvas');
    this.paused = false;
    this.visible = true;
    this.elapsed = 0;          // seconds into the loop while running
    this.lastNow = 0;
    this.lastFrame = 0;
    this.raf = 0;
    this.reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var self = this;
    this.resize();
    if ('ResizeObserver' in global) {
      new ResizeObserver(function () { self.resize(); self.renderAt(self.elapsed); }).observe(root);
    } else {
      global.addEventListener('resize', function () { self.resize(); self.renderAt(self.elapsed); });
    }
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (e) { self.visible = e[0].isIntersecting; self.visible ? self._loop() : self._stop(); }, { threshold: 0.02 }).observe(root);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? self._stop() : self._loop(); });

    if (this.reduced) {           // static frame; user can opt in via play()
      this.paused = true;
      this.renderAt(opts.staticTime != null ? opts.staticTime : 1.7);
    } else {
      this._loop();
    }
  }

  Spectrum.prototype.resize = function () {
    var r = this.root.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width));
    this.H = Math.max(1, Math.round(r.height));
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.W2 = Math.ceil(this.W / LOWRES); this.H2 = Math.ceil(this.H / LOWRES);
    this.low.width = this.W2; this.low.height = this.H2;
    this.img = this.low.getContext('2d').createImageData(this.W2, this.H2);
    this.glowA.width = Math.max(2, Math.round(this.W / 10)); this.glowA.height = Math.max(2, Math.round(this.H / 10));
    this.glowB.width = Math.max(2, Math.round(this.W / 28)); this.glowB.height = Math.max(2, Math.round(this.H / 28));
    this.dots.width = this.W * this.dpr; this.dots.height = this.H * this.dpr;
    this.dotGlow.width = Math.max(2, Math.round(this.W / 7)); this.dotGlow.height = Math.max(2, Math.round(this.H / 7));
    // per-column static data (colour + band skeleton)
    var n = this.W2;
    this.base = new Float32Array(n * 3);
    this.bandStatic = new Float32Array(n);
    this.bright = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.trail = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i + .5) * LOWRES, u = x / this.W;
      var rgb = hsl2rgb(hueAt(u), satAt(u), .52);
      this.base[i * 3] = rgb[0]; this.base[i * 3 + 1] = rgb[1]; this.base[i * 3 + 2] = rgb[2];
      var s1 = noise2(x / 18, 2.5), s2 = noise2(x / 60, 9.5), s3 = noise2(x / 7, 4.25);
      this.bandStatic[i] = .50 * s1 + .38 * s2 + .12 * s3;
    }
    // dot-grid geometry
    this.cols = Math.ceil(this.W / this.pitch) + 1;
    this.rows = Math.ceil(this.H / this.pitch) + 1;
    this.dotHue = new Float32Array(this.cols);
    this.dotSat = new Float32Array(this.cols);
    this.dotL = new Float32Array(this.cols);
    this.dotCol = new Float32Array(this.cols);
    for (var c = 0; c < this.cols; c++) {
      var ux = (c * this.pitch + this.pitch / 2) / this.W;
      this.dotHue[c] = hueAt(ux); this.dotSat[c] = satAt(ux);
      this.dotL[c] = lerp(.34, .70, smooth(.58, .76, ux));           // dark dots on blue, bright on green/yellow
      this.dotCol[c] = noise2(c * .09, 8.5) > .30 ? 1 : 0;           // slow column clusters
    }
  };

  // Render the loop at time t (seconds, any value; wraps on PERIOD)
  Spectrum.prototype.renderAt = function (t) {
    t = ((t % PERIOD) + PERIOD) % PERIOD;
    this.elapsed = t;
    var ph = TAU * t / PERIOD, cz = 2.5 + Math.cos(ph), cw = 2.5 + Math.sin(ph);
    var W = this.W, H = this.H, W2 = this.W2, H2 = this.H2, data = this.img.data, n = W2;

    /* --- column layer --- */
    for (var i = 0; i < n; i++) {
      var x = (i + .5) * LOWRES;
      var mod = noise4(x / 26, 5.5, cz * 1.15, cw * 1.15);
      var b = this.bandStatic[i] * (.62 + .85 * mod);
      b = smooth(.18, .82, b);
      this.bright[i] = .24 + .90 * b;
      this.lift[i] = Math.max(0, b - .9) * .14;
      this.trail[i] = .22 + .34 * noise4(x / 38, 12.5, cz * .6, cw * .6);
    }
    // coarse vertical streak field, sampled every 6 low-res rows
    var sr = Math.ceil(H2 / 6) + 1, streak = new Float32Array(n * sr);
    for (var j = 0; j < sr; j++) {
      var yy = j * 6 * LOWRES;
      for (i = 0; i < n; i++) streak[j * n + i] = .84 + .32 * (noise4((i * LOWRES) / 7, yy / 70, cz * .8 + 3, cw * .8) - .5);
    }
    var p = 0;
    for (var y = 0; y < H2; y++) {
      var v = (y + .5) / H2;
      var gFade = 1 - smooth(.34, 1.0, v) * .9;
      var sj = y / 6, sj0 = Math.floor(sj), sjt = sj - sj0, row0 = sj0 * n, row1 = Math.min(sj0 + 1, sr - 1) * n;
      for (i = 0; i < n; i++) {
        var ts = this.trail[i];
        var cFade = 1 - smooth(ts, ts + .55, v) * .8;
        var s = lerp(streak[row0 + i], streak[row1 + i], sjt);
        var k = this.bright[i] * cFade * gFade * s;
        var l = this.lift[i] * cFade * gFade;
        var r = this.base[i * 3] * k + l, g = this.base[i * 3 + 1] * k + l, bb = this.base[i * 3 + 2] * k + l;
        data[p] = r > 1 ? 255 : r * 255; data[p + 1] = g > 1 ? 255 : g * 255; data[p + 2] = bb > 1 ? 255 : bb * 255; data[p + 3] = 255;
        p += 4;
      }
    }
    this.low.getContext('2d').putImageData(this.img, 0, 0);

    /* --- dot layer --- */
    var dc = this.dots.getContext('2d');
    dc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    dc.clearRect(0, 0, W, H);
    var pitch = this.pitch;
    for (var c = 0; c < this.cols; c++) {
      if (!this.dotCol[c]) continue;
      var colGate = noise4(c * .42, 1.5, cz * .7 + 7, cw * .7);
      var colGate2 = noise4(c * .6, 3.5, cz * 1.1 + 5, cw * 1.1);
      var xd = c * pitch + pitch / 2, uc = xd / W;
      if (colGate < lerp(.36, .14, smooth(.30, .70, uc))) continue;   // sparse dots on the left, dense on the right
      var li = Math.min(n - 1, Math.floor(xd / LOWRES));
      var brightCol = this.bright[li], tsd = this.trail[li];
      var hue = this.dotHue[c], sat = this.dotSat[c] * 100, Lb = this.dotL[c];
      for (var rr = 0; rr < this.rows; rr++) {
        var yd = rr * pitch + pitch / 2, vd = yd / H;
        if (hash(c, rr, 99, 1) < .10) continue;                       // permanently missing cells
        var f = .65 * colGate2 + .35 * noise4(c * .35, rr * .28, cz * 1.3 + 11, cw * 1.3);   // column-led shimmer + gentle per-cell variation
        var vis = smooth(.30, .70, f);
        var a = (.30 + .70 * vis) * (1 - smooth(tsd - .08, tsd + .34, vd)) * (1 - smooth(.40, .72, vd)) * (.45 + .55 * brightCol) * lerp(.7, 1, smooth(.48, .72, uc));
        if (a < .03) continue;
        var L = Lb + .16 * (f - .5);
        dc.fillStyle = 'hsla(' + hue + ',' + sat + '%,' + (L * 100) + '%,' + a + ')';
        var rad = 1.9 + .6 * vis;
        dc.beginPath(); dc.arc(xd, yd, rad, 0, TAU); dc.fill();
      }
    }

    /* --- composite --- */
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.low, 0, 0, W, H);
    // bloom: downscale then upscale = cheap wide blur
    var ga = this.glowA.getContext('2d'); ga.drawImage(this.low, 0, 0, this.glowA.width, this.glowA.height);
    var gb = this.glowB.getContext('2d'); gb.drawImage(this.glowA, 0, 0, this.glowB.width, this.glowB.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .16; ctx.drawImage(this.glowA, 0, 0, W, H);
    ctx.globalAlpha = .13; ctx.drawImage(this.glowB, 0, 0, W, H);
    // dots + their halo
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(this.dots, 0, 0, W, H);
    var dg = this.dotGlow.getContext('2d'); dg.clearRect(0, 0, this.dotGlow.width, this.dotGlow.height);
    dg.drawImage(this.dots, 0, 0, this.dotGlow.width, this.dotGlow.height);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .45;
    ctx.drawImage(this.dotGlow, 0, 0, W, H);
    // guarantee true black at the bottom
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    var grad = ctx.createLinearGradient(0, H * .72, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = grad; ctx.fillRect(0, H * .72, W, H * .28);
  };

  Spectrum.prototype._loop = function () {
    if (this.raf || this.paused || !this.visible) return;
    var self = this;
    this.lastNow = performance.now();
    function frame(now) {
      self.raf = 0;
      if (self.paused || !self.visible) return;
      var dt = (now - self.lastNow) / 1000; self.lastNow = now;
      self.elapsed = (self.elapsed + Math.min(dt, .1)) % PERIOD;
      if (now - self.lastFrame >= 1000 / FPS_CAP - 2) { self.lastFrame = now; self.renderAt(self.elapsed); }
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };
  Spectrum.prototype._stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  Spectrum.prototype.pause = function () { this.paused = true; this._stop(); this.root.dispatchEvent(new CustomEvent('spectrum:state', { detail: { paused: true } })); };
  Spectrum.prototype.play = function () { this.paused = false; this._loop(); this.root.dispatchEvent(new CustomEvent('spectrum:state', { detail: { paused: false } })); };
  Spectrum.prototype.toggle = function () { this.paused ? this.play() : this.pause(); return this.paused; };

  global.OmenSpectrum = {
    PERIOD: PERIOD,
    mount: function (root, opts) { return new Spectrum(root, opts); },
    hueAt: hueAt, satAt: satAt
  };
})(window);
