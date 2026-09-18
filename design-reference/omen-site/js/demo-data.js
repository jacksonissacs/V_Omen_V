/* OMEN demo data — deterministic and illustrative.
 * Nothing here is a real market, source, customer or performance claim.
 * Every component on the landing page reads from this object so the demo is reproducible. */
window.OMEN_DEMO = {
  disclaimer: 'Demo — illustrative data, not live.',
  event: {
    id: 'evt-boc-oct',
    title: 'Bank of Canada cuts rates in October',
    category: 'Macro',
    resolves: 'Oct 29 2026',
    date: 'Sep 10 2026',
    tz: 'EDT',
    consensusNow: 73.8,
    omenEstimate: 71.2,
    estimateBand: 3.4,          // ± points, shown as the uncertainty band
    moveFrom: 61.2, moveTo: 73.8, movePts: 12.6, moveSigma: 4.7, moveWindow: '18 min',
    explained: 69, unexplained: 31,
    identificationConfidence: 89,
    dataQuality: 'High',
    analogues: { n: 41, medianResponse: 8.9, medianLag: '1m 42s' },
    catalyst: { time: '14:30:00', label: 'Statistics Canada CPI release', tier: 'Tier 1 source' }
  },
  // one point per minute from 14:00 to 15:00 (61 points). consensus = market probability, est = OMEN estimate
  series: (function () {
    var base = [61.0,61.2,61.1,61.3,61.2,61.0,61.2,61.4,61.3,61.1,61.2,61.3,61.2,61.0,61.1,61.3,61.2,61.4,61.3,61.2,
                61.1,61.2,61.3,61.2,61.1,61.2,61.4,61.3,61.2,61.2,          // 14:00–14:29 flat
                61.2,63.1,65.4,67.9,70.1,71.6,72.4,73.0,73.9,73.6,73.8,      // 14:30–14:40 the move
                74.1,73.7,73.8,73.9,73.6,73.8,74.0,73.8,73.7,73.8,73.9,73.8,73.7,73.8,73.9,73.8,73.8,73.7,73.8,73.8];
    var pts = [];
    for (var i = 0; i < base.length; i++) {
      var m = i, hh = 14 + Math.floor(m / 60), mm = m % 60;
      var t = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
      var est = i < 30 ? base[i] - .4 : i < 41 ? base[i] - 1.2 - (i - 30) * .12 : 71.2 + ((i * 7) % 3) * .1;
      pts.push({ t: t, p: base[i], est: +est.toFixed(1), band: i < 30 ? 1.8 : i < 41 ? 2.6 + (i - 30) * .1 : 3.4 });
    }
    return pts;
  })(),
  moveStart: 30, moveEnd: 40, // indices into series
  evidence: [
    { t: '14:30:00', text: 'Statistics Canada CPI release', kind: 'catalyst', delta: null },
    { t: '14:30:42', text: 'CAD begins repricing', kind: 'signal', delta: '−0.4%' },
    { t: '14:31:08', text: 'Canadian 2Y yields move', kind: 'signal', delta: '+17 bps' },
    { t: '14:31:51', text: 'OMEN detects abnormal movement', kind: 'system', delta: null },
    { t: '14:32:07', text: 'Probability rises', kind: 'move', delta: '+4.2 pts' },
    { t: '14:34:16', text: 'Related rate market reacts', kind: 'signal', delta: '+6 pts' },
    { t: '14:38:42', text: 'Move reaches full size', kind: 'move', delta: '+12.6 pts' }
  ],
  // what the archive can show at a given minute index — headlines known at that time
  archive: [
    { until: 29, items: ['Markets await 14:30 CPI print', 'Consensus for October cut steady near 61%', 'No scheduled BoC communications today'] },
    { until: 34, items: ['CPI print released: headline below expectations', 'CAD softens against USD', '2Y yields fall on the print'] },
    { until: 60, items: ['Rate-cut odds reprice sharply after CPI', 'Related October rate market moves +6 pts', 'Housing-correction market has not reacted'] }
  ],
  pulse: [
    { cat: 'Macro', t: '14:42', title: 'Bank of Canada cuts rates in October', from: 61.2, to: 73.8, pts: '+12.6', sigma: '4.7σ over 18 min', explained: 69, catalyst: 'Statistics Canada CPI release', conf: 'High' },
    { cat: 'AI', t: '11:07', title: 'Frontier model released before December 1', from: 44.0, to: 52.5, pts: '+8.5', sigma: '2.1σ over 3.2 hrs', explained: 46, catalyst: 'Compute-provider capacity disclosure', conf: 'Medium' },
    { cat: 'Economics', t: '14:58', title: 'Canadian housing correction by Q2 2027', from: 34.0, to: 34.2, pts: '+0.2', sigma: 'Expected reaction missing', explained: null, catalyst: 'Historically moves with BoC surprises in 78% of comparable shocks', conf: 'Low' }
  ],
  ledger: [
    { name: 'Market consensus', type: 'aggregate', calibration: 83, brier: 0.121, coverage: 96, scored: 12407 },
    { name: 'Bank of Canada', type: 'institution', calibration: 74, brier: 0.158, coverage: 82, scored: 1824 },
    { name: 'Forecaster A', type: 'individual', calibration: 81, brier: 0.142, coverage: 72, scored: 128 },
    { name: 'Model X', type: 'model', calibration: 79, brier: 0.130, coverage: 91, scored: 4210 }
  ],
  relation: { a: 'Bank of Canada cuts rates in October', b: 'Canadian housing correction by Q2 2027', historical: 78, elapsed: '26 min', observed: 'No meaningful movement' }
};
