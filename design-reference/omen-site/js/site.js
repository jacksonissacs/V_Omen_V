/* OMEN landing — page behaviour. No scroll hijacking, no scroll-triggered reveals.
 * All demo state derives from window.OMEN_DEMO so every interaction is reproducible. */
(function () {
  'use strict';
  var D = window.OMEN_DEMO, S = D.series, E = D.event;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- chart ---------- */
  function chartSVG(idx, opts) {
    // idx = last visible minute index (0..60); opts.highlightMove draws the move window
    var W = 600, H = 190, padL = 34, padR = 8, padT = 12, padB = 20;
    var y0 = 55, y1 = 80;
    function X(i) { return padL + (i / (S.length - 1)) * (W - padL - padR); }
    function Y(p) { return padT + (1 - (p - y0) / (y1 - y0)) * (H - padT - padB); }
    var line = '', est = '', bandTop = '', bandBot = '';
    for (var i = 0; i <= idx; i++) {
      var pt = S[i];
      line += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(pt.p).toFixed(1);
      est += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(pt.est).toFixed(1);
      bandTop += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(pt.est + pt.band).toFixed(1);
      bandBot = 'L' + X(i).toFixed(1) + ',' + Y(pt.est - pt.band).toFixed(1) + bandBot;
    }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Probability over time, 14:00 to 15:00">';
    [60, 65, 70, 75, 80].forEach(function (v) {
      s += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>';
      s += '<text class="axis" x="' + (padL - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end">' + v + '%</text>';
    });
    [0, 15, 30, 45, 60].forEach(function (i) {
      s += '<text class="axis" x="' + X(i) + '" y="' + (H - 4) + '" text-anchor="middle">' + S[i].t + '</text>';
    });
    if (opts.highlightMove) s += '<rect class="hl" x="' + X(D.moveStart) + '" y="' + padT + '" width="' + (X(D.moveEnd) - X(D.moveStart)) + '" height="' + (H - padT - padB) + '"/>';
    s += '<path class="band" d="' + bandTop + bandBot + 'Z"/>';
    s += '<path class="est" d="' + est + '"/>';
    s += '<path class="line" d="' + line + '"/>';
    if (idx < S.length - 1) s += '<rect class="future" x="' + X(idx) + '" y="' + padT + '" width="' + (W - padR - X(idx)) + '" height="' + (H - padT - padB) + '"/>';
    if (opts.cursor) s += '<line class="cursor" x1="' + X(idx) + '" x2="' + X(idx) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>';
    s += '<circle class="marker" cx="' + X(idx) + '" cy="' + Y(S[idx].p) + '" r="3.5"/>';
    if (opts.highlightMove) s += '<text class="callout" x="' + (X(D.moveStart) + 4) + '" y="' + (padT + 12) + '">CPI 14:30</text>';
    return s + '</svg>';
  }

  /* ---------- event card ---------- */
  function fmt(p) { var s = p.toFixed(1); return s.slice(0, -2) + '<small>.' + s.slice(-1) + '%</small>'; }
  function archiveAt(idx) { for (var i = 0; i < D.archive.length; i++) if (idx <= D.archive[i].until) return D.archive[i].items; return D.archive[D.archive.length - 1].items; }
  function secs(t) { var a = t.split(':'); return (+a[0]) * 3600 + (+a[1]) * 60 + (+(a[2] || 0)); }

  function renderCard(root, state) {
    var idx = state.idx, pt = S[idx], from = S[0].p, delta = pt.p - from;
    var moved = idx >= D.moveEnd, inMove = idx >= D.moveStart && idx < D.moveEnd;
    var stepCls = state.step ? ' step-' + state.step : '';
    var html =
      '<div class="event-card' + stepCls + '">' +
      '<div class="event-main">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="chip">' + E.category + '</span><span class="chip hi"><span class="dot"></span>' + E.catalyst.tier + '</span><span class="chip">Resolves ' + E.resolves + '</span><span class="chip demo">' + D.disclaimer + '</span></div>' +
        '<h3 class="event-title">' + E.title + '</h3>' +
        '<div class="readout">' +
          '<div><div class="lbl">Probability</div><div class="prob prob-xl" aria-live="polite">' + fmt(pt.p) + '</div></div>' +
          '<div><div class="lbl">Movement since 14:00</div><div class="move ' + (delta > .5 ? 'up' : delta < -.5 ? 'dn' : 'quiet') + '">' + (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(1) + ' pts</div>' +
            '<div class="stamp">' + (moved ? E.moveSigma + 'σ over ' + E.moveWindow : inMove ? 'move in progress' : 'no abnormal movement') + '</div></div>' +
          '<div><div class="lbl">As of</div><div class="stamp" style="color:var(--tx-0);font-size:13px">' + E.date + ' · ' + pt.t + ':00 ' + E.tz + '</div>' +
            '<div class="stamp">' + (idx === S.length - 1 ? 'latest observation' : 'point-in-time view') + '</div></div>' +
        '</div>' +
        '<div class="chart">' + chartSVG(idx, { highlightMove: state.step !== 3 || moved, cursor: state.step === 3 }) + '</div>' +
      '</div>' +
      '<div class="event-side">' +
        '<div><div class="side-title"><b>Evidence</b><span>' + (moved ? 'Primary catalyst identified' : idx >= D.moveStart ? 'Collecting signals' : 'Nothing yet') + '</span></div>' +
          '<ul class="ev-list">' + D.evidence.map(function (ev) {
            var visible = secs(ev.t) <= secs(pt.t + ':59');
            return '<li class="ev-' + ev.kind + (visible ? '' : (state.step === 3 ? ' hidden' : ' future')) + '"><span class="t">' + ev.t + '</span><span class="txt">' + ev.text + '</span><span class="d">' + (ev.delta || '') + '</span></li>';
          }).join('') + '</ul></div>' +
        '<div class="unc">' +
          '<div class="side-title"><b>Uncertainty</b></div>' +
          '<div class="unc-row"><span>OMEN estimate</span><b>' + pt.est.toFixed(1) + '% ± ' + pt.band.toFixed(1) + '</b></div>' +
          '<div class="unc-row"><span>Explained by identified signals</span><b>' + (moved ? E.explained + '%' : inMove ? '—' : 'n/a') + '</b></div>' +
          '<div class="bar" role="img" aria-label="Explained ' + E.explained + ' percent, unexplained ' + E.unexplained + ' percent"><i style="width:' + (moved ? E.explained : 0) + '%"></i><i class="rest" style="width:' + (moved ? E.unexplained : 0) + '%"></i></div>' +
          '<div class="unc-row"><span>Identification confidence</span><b>' + (moved ? E.identificationConfidence + '%' : '—') + '</b></div>' +
          '<div class="unc-row"><span>Historical analogues</span><b>n = ' + E.analogues.n + '</b></div>' +
          '<p>' + (moved ? 'The CPI release is the most likely trigger, but comparable releases account for about ' + E.explained + '% of a move this size. The remainder is unexplained and shown as such.' : 'Uncertainty is stated at every point in time, not only after the fact.') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="rewind">' +
        '<label for="' + root.id + '-scrub">Rewind to <b>' + pt.t + ' ' + E.tz + '</b></label>' +
        '<input id="' + root.id + '-scrub" type="range" min="0" max="' + (S.length - 1) + '" step="1" value="' + idx + '" aria-valuetext="' + pt.t + ', ' + pt.p.toFixed(1) + ' percent">' +
        '<div class="snapshot"><span class="k">Known at ' + pt.t + '</span><ul>' + archiveAt(idx).map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ul></div>' +
      '</div>' +
      '</div>';
    root.innerHTML = html;
  }

  /* ---------- preview ---------- */
  var preview = $('#preview-card');
  if (preview) renderCard(preview, { idx: S.length - 1, step: 0 });

  /* ---------- walkthrough ---------- */
  var walk = $('#walk-card'), stepBtns = $$('.step');
  var walkState = { step: 1, idx: S.length - 1 };
  function drawWalk() {
    if (walkState.step === 3) {
      renderCard(walk, walkState);
      var range = $('input[type=range]', walk);
      range.addEventListener('input', function () { walkState.idx = +range.value; renderCard(walk, walkState); $('input[type=range]', walk).focus(); });
    } else {
      renderCard(walk, { step: walkState.step, idx: S.length - 1 });
    }
    stepBtns.forEach(function (b) { var on = +b.dataset.step === walkState.step; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  }
  stepBtns.forEach(function (b) {
    b.addEventListener('click', function () { walkState.step = +b.dataset.step; if (walkState.step === 3 && walkState.idx === S.length - 1) walkState.idx = 34; drawWalk(); });
    b.addEventListener('keydown', function (e) {
      var i = stepBtns.indexOf(b), n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : null;
      if (n === null) return; e.preventDefault(); n = (n + stepBtns.length) % stepBtns.length; stepBtns[n].focus(); stepBtns[n].click();
    });
  });
  if (walk) drawWalk();

  /* ---------- pulse / archive / ledger fragments ---------- */
  var pulse = $('#pulse-list');
  if (pulse) pulse.innerHTML = D.pulse.map(function (m) {
    var conf = m.conf === 'High' ? 'hi' : m.conf === 'Medium' ? 'med' : 'lo';
    var missing = m.explained === null;
    return '<div class="pulse-row"><div><div class="meta"><span>' + m.cat + '</span><span class="t">' + m.t + ' ' + E.tz + '</span><span class="chip ' + conf + '"><span class="dot"></span>' + (missing ? 'Expected reaction missing' : m.conf + ' confidence') + '</span></div>' +
      '<h4>' + m.title + '</h4><div class="why">' + (missing ? m.catalyst + '. ' + m.sigma + '.' : 'Primary catalyst: ' + m.catalyst + ' — explained ' + m.explained + '%') + '</div></div>' +
      '<div class="nums"><span class="prob prob-md">' + m.from.toFixed(1) + '% → ' + m.to.toFixed(1) + '%</span><span class="move ' + (missing ? 'quiet' : 'up') + '">' + m.pts + ' pts</span><span class="stamp">' + (missing ? '26 min since shock' : m.sigma) + '</span></div></div>';
  }).join('');

  var arch = $('#archive-snapshot');
  if (arch) { var ai = 33; arch.innerHTML = '<div class="pit-time"><span class="chip">Point-in-time</span><span class="stamp">' + E.date + ' · ' + S[ai].t + ':00 ' + E.tz + '</span></div>' +
    '<div class="kv"><span class="k">Consensus then</span><span class="v prob prob-md">' + S[ai].p.toFixed(1) + '%</span><span class="k">OMEN estimate then</span><span class="v num">' + S[ai].est.toFixed(1) + '% ± ' + S[ai].band.toFixed(1) + '</span></div>' +
    '<h5>Headlines available at that moment</h5><ul>' + archiveAt(ai).map(function (h) { return '<li>' + h + '</li>'; }).join('') + '</ul>' +
    '<h5>Evidence observed so far</h5><ul>' + D.evidence.filter(function (e) { return secs(e.t) <= secs(S[ai].t + ':59'); }).map(function (e) { return '<li><span class="stamp" style="margin-right:8px">' + e.t + '</span>' + e.text + (e.delta ? ' <span class="num quiet">' + e.delta + '</span>' : '') + '</li>'; }).join('') + '</ul>'; }

  var led = $('#ledger-table tbody');
  if (led) led.innerHTML = D.ledger.map(function (r) {
    return '<tr><td><b style="font-weight:500">' + r.name + '</b><div class="quiet" style="font-size:11px">' + r.type + '</div></td><td><span class="cal"><span class="num">' + r.calibration + '%</span><span class="bar"><i style="width:' + r.calibration + '%"></i></span></span></td><td class="num">' + r.brier.toFixed(3) + '</td><td class="num">' + r.coverage + '%</td><td class="num">' + r.scored.toLocaleString('en-CA') + '</td></tr>';
  }).join('');

  /* ---------- nav ---------- */
  var navBtn = $('.nav-toggle'), nav = $('#site-nav');
  if (navBtn) {
    navBtn.addEventListener('click', function () { var open = nav.classList.toggle('open'); navBtn.setAttribute('aria-expanded', open); });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); navBtn.focus(); } });
  }
  // in-page links: honour reduced motion for scrolling; never hijack the wheel
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : document.documentElement;
      if (!el) return; e.preventDefault();
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (el !== document.documentElement) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
      history.replaceState(null, '', id ? '#' + id : ' ');
    });
  });

  /* ---------- request access (demo dialog, sends nothing) ---------- */
  var dlg = $('#access');
  if (dlg) {
    var opener = null;
    $$('[data-open-access]').forEach(function (b) { b.addEventListener('click', function () { opener = b; dlg.classList.remove('done'); dlg.showModal(); $('#access-email').focus(); }); });
    $('#access-cancel').addEventListener('click', function () { dlg.close(); });
    $('#access-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { if (opener) opener.focus(); });
    $('#access-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#access-email'), field = input.closest('.field'), ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
      field.classList.toggle('invalid', !ok); input.setAttribute('aria-invalid', !ok);
      if (!ok) { input.focus(); return; }
      dlg.classList.add('done'); $('#access-close').focus();
    });
  }

  /* ---------- spectrum mounts ---------- */
  function mountSpectrum(stageId, btnId, noteId, staticTime) {
    var stage = document.getElementById(stageId); if (!stage) return null;
    var fx = OmenSpectrum.mount(stage, { staticTime: staticTime });
    var btn = document.getElementById(btnId), note = document.getElementById(noteId);
    function sync(p) { btn.setAttribute('aria-pressed', p ? 'true' : 'false'); }
    sync(fx.paused); if (fx.reduced && note) note.classList.add('on');
    btn.addEventListener('click', function () { sync(fx.toggle()); if (note) note.classList.remove('on'); });
    stage.addEventListener('spectrum:state', function (e) { sync(e.detail.paused); });
    return fx;
  }
  window.__omenSpectrum = mountSpectrum('spectrum', 'motion-toggle', 'motion-note', 1.7);
  window.__omenHero = mountSpectrum('hero-spectrum', 'hero-motion-toggle', 'hero-motion-note', 4.2);
})();
