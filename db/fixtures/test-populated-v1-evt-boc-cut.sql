-- Test-only: legacy v1 (migration 0001) history for evt-boc-cut.
-- Used by postgres.db.test.ts before applying 0002. Not a migration.
BEGIN;

INSERT INTO events (
  id, title, question, status, deadline, resolution_criteria,
  category, significance, region, summary, tags, related_event_ids,
  provenance, followed_by_default, catalog_position, display
) VALUES (
  'evt-boc-cut',
  'Bank of Canada cuts rates in October',
  'Will the Bank of Canada cut the overnight rate at the 28–29 October 2026 decision?',
  'active',
  '2026-10-29T13:45:00.000Z',
  'Resolves YES if the Bank of Canada announces a reduction of its target for the overnight rate at the interest-rate decision scheduled for 29 October 2026, as published on bankofcanada.ca. Resolves NO if the target is held or raised at that decision. An unscheduled move before that date does not count.',
  'Economics',
  'critical',
  'Canada',
  'Implied October cut odds jumped after Statistics Canada printed a softer CPI path than desks had marked.',
  ARRAY['BoC', 'CPI', 'rates'],
  ARRAY['evt-housing-ca', 'evt-fed-cut', 'evt-ecb-cut'],
  'demo',
  true,
  0,
  '{}'::jsonb
);

INSERT INTO probability_observations (
  event_id, source_kind, source_name, probability_type, probability_pct,
  observed_at, captured_at, provenance
) VALUES
  ('evt-boc-cut', 'provider', 'OMEN demo book', 'market_implied', 48.00,
   '2026-08-01T12:00:00.000Z', '2026-08-01T12:01:00.000Z', 'demo'),
  ('evt-boc-cut', 'provider', 'OMEN demo book', 'market_implied', 58.40,
   '2026-08-17T14:35:00.000Z', '2026-08-17T14:36:00.000Z', 'demo'),
  ('evt-boc-cut', 'provider', 'OMEN demo book', 'market_implied', 61.20,
   '2026-09-01T12:00:00.000Z', '2026-09-01T12:01:00.000Z', 'demo'),
  ('evt-boc-cut', 'provider', 'OMEN demo book', 'market_implied', 73.80,
   '2026-09-04T18:42:00.000Z', '2026-09-04T18:43:00.000Z', 'demo');

INSERT INTO evidence (
  id, event_id, source_name, source_published_at, first_observed_at, captured_at,
  summary, stance, reliability, recorded_by, provenance
) VALUES (
  'ev-boc-1',
  'evt-boc-cut',
  'Statistics Canada CPI, August 2026',
  '2026-09-04T18:30:00.000Z',
  '2026-09-04T18:30:41.000Z',
  '2026-09-04T18:30:46.000Z',
  'Headline 1.9% y/y; core trimmed mean 2.4%. Below the 2.1 / 2.6 desk marks.',
  'supports',
  0.96,
  'omen-demo-seed',
  'demo'
);

INSERT INTO move_logs (id, event_id) VALUES ('ml-boc-cut-2026-09-04', 'evt-boc-cut');

INSERT INTO move_log_revisions (
  move_log_id, version, published_at, author, what_changed, likely_cause,
  explained_pct, unexplained_factors, evidence_ids, provenance
) VALUES (
  'ml-boc-cut-2026-09-04',
  1,
  '2026-09-04T18:45:00.000Z',
  'OMEN demo desk',
  'Consensus moved +12.6 pts in 18 minutes after the 14:30 CPI release. The 2s/CAD complex led; housing did not follow.',
  'Statistics Canada CPI release',
  69.00,
  ARRAY[
    'Canadian housing did not reprice with the rate shock',
    'Residual 31% of the move is not identified in the first-hour tape'
  ],
  ARRAY['ev-boc-1'],
  'demo'
);

COMMIT;
