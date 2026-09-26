-- OMEN V0 core event storage.
--
-- Probability scale: every probability is stored as percentage points in
-- numeric(5,2), constrained to 0.00–100.00 inclusive (73.8 means 73.8%).
--
-- Provenance ('demo' | 'sourced') is recorded on every row and is independent
-- of the storage mode. Illustrative records stored here remain 'demo'.
--
-- History is append-only: probability observations, evidence, move logs and
-- move log revisions reject UPDATE, DELETE and TRUNCATE. A correction to a
-- published move log is a new revision with a higher version and a note.

CREATE FUNCTION omen_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OMEN history is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TABLE events (
  id text PRIMARY KEY
    CONSTRAINT events_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  title text NOT NULL
    CONSTRAINT events_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  question text NOT NULL
    CONSTRAINT events_question_precise CHECK (
      char_length(btrim(question)) BETWEEN 15 AND 500 AND right(btrim(question), 1) = '?'
    ),
  status text NOT NULL
    CONSTRAINT events_status_known CHECK (status IN ('watch', 'active', 'resolved')),
  deadline timestamptz NOT NULL,
  resolution_criteria text NOT NULL
    CONSTRAINT events_resolution_criteria_length CHECK (char_length(btrim(resolution_criteria)) >= 20),
  category text NOT NULL
    CONSTRAINT events_category_known CHECK (category IN (
      'AI', 'Technology', 'Economics', 'Geopolitics', 'Companies',
      'Regulation', 'Markets', 'Energy', 'Crypto', 'Science'
    )),
  significance text NOT NULL
    CONSTRAINT events_significance_known CHECK (significance IN ('critical', 'high', 'medium', 'low')),
  region text NOT NULL,
  summary text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  related_event_ids text[] NOT NULL DEFAULT '{}'
    CONSTRAINT events_not_self_related CHECK (NOT (id = ANY (related_event_ids))),
  provenance text NOT NULL
    CONSTRAINT events_provenance_known CHECK (provenance IN ('demo', 'sourced')),
  followed_by_default boolean NOT NULL DEFAULT false,
  catalog_position integer NOT NULL DEFAULT 0,
  -- Presentation-only context for the workspace (signals, analogues, timeline…).
  display jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT events_display_object CHECK (jsonb_typeof(display) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION omen_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_touch_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION omen_touch_updated_at();

CREATE TABLE probability_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  source_kind text NOT NULL
    CONSTRAINT observations_source_kind_known CHECK (source_kind IN ('provider', 'author')),
  source_name text NOT NULL
    CONSTRAINT observations_source_name_present CHECK (char_length(btrim(source_name)) > 0),
  probability_type text NOT NULL
    CONSTRAINT observations_probability_type_known CHECK (
      probability_type IN ('market_implied', 'forecaster_estimate', 'model_estimate')
    ),
  probability_pct numeric(5, 2) NOT NULL
    CONSTRAINT observations_probability_scale CHECK (probability_pct BETWEEN 0 AND 100),
  observed_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  note text,
  provenance text NOT NULL
    CONSTRAINT observations_provenance_known CHECK (provenance IN ('demo', 'sourced')),
  CONSTRAINT observations_captured_after_observed CHECK (captured_at >= observed_at),
  CONSTRAINT observations_unique_point UNIQUE (event_id, source_kind, source_name, probability_type, observed_at)
);

CREATE INDEX probability_observations_event_time
  ON probability_observations (event_id, observed_at);

CREATE TABLE evidence (
  id text PRIMARY KEY
    CONSTRAINT evidence_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  source_name text NOT NULL
    CONSTRAINT evidence_source_name_present CHECK (char_length(btrim(source_name)) > 0),
  source_url text
    CONSTRAINT evidence_source_url_http CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  -- When the source says it was published. NULL when the source carries no date.
  source_published_at timestamptz,
  -- When OMEN first saw the source. Never substituted for the publication time.
  first_observed_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL
    CONSTRAINT evidence_summary_present CHECK (char_length(btrim(summary)) > 0),
  stance text NOT NULL
    CONSTRAINT evidence_stance_known CHECK (stance IN ('supports', 'contradicts', 'contextual')),
  reliability numeric(3, 2) NOT NULL
    CONSTRAINT evidence_reliability_scale CHECK (reliability BETWEEN 0 AND 1),
  recorded_by text NOT NULL
    CONSTRAINT evidence_recorded_by_present CHECK (char_length(btrim(recorded_by)) > 0),
  provenance text NOT NULL
    CONSTRAINT evidence_provenance_known CHECK (provenance IN ('demo', 'sourced')),
  CONSTRAINT evidence_published_before_observed CHECK (
    source_published_at IS NULL OR source_published_at <= first_observed_at
  ),
  CONSTRAINT evidence_observed_before_captured CHECK (first_observed_at <= captured_at)
);

CREATE INDEX evidence_event ON evidence (event_id);

CREATE TABLE move_logs (
  id text PRIMARY KEY
    CONSTRAINT move_logs_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX move_logs_event ON move_logs (event_id);

CREATE TABLE move_log_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  move_log_id text NOT NULL REFERENCES move_logs (id) ON DELETE RESTRICT,
  version integer NOT NULL
    CONSTRAINT move_log_revisions_version_positive CHECK (version >= 1),
  published_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  author text NOT NULL
    CONSTRAINT move_log_revisions_author_present CHECK (char_length(btrim(author)) > 0),
  what_changed text NOT NULL
    CONSTRAINT move_log_revisions_what_changed_present CHECK (char_length(btrim(what_changed)) > 0),
  likely_cause text NOT NULL
    CONSTRAINT move_log_revisions_likely_cause_present CHECK (char_length(btrim(likely_cause)) > 0),
  explained_pct numeric(5, 2) NOT NULL
    CONSTRAINT move_log_revisions_explained_scale CHECK (explained_pct BETWEEN 0 AND 100),
  unexplained_factors text[] NOT NULL DEFAULT '{}',
  evidence_ids text[] NOT NULL DEFAULT '{}',
  correction_note text,
  provenance text NOT NULL
    CONSTRAINT move_log_revisions_provenance_known CHECK (provenance IN ('demo', 'sourced')),
  CONSTRAINT move_log_revisions_unique_version UNIQUE (move_log_id, version),
  CONSTRAINT move_log_revisions_correction_note CHECK (
    (version = 1 AND correction_note IS NULL)
    OR (version > 1 AND correction_note IS NOT NULL AND char_length(btrim(correction_note)) > 0)
  )
);

-- Versions are consecutive, publication times never go backwards, and linked
-- evidence must exist on the same event. The move log row lock serialises
-- concurrent publications.
CREATE FUNCTION omen_check_move_log_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  log_event_id text;
  latest_version integer;
  latest_published_at timestamptz;
  foreign_evidence text;
BEGIN
  SELECT event_id INTO log_event_id FROM move_logs WHERE id = NEW.move_log_id FOR UPDATE;

  SELECT version, published_at INTO latest_version, latest_published_at
    FROM move_log_revisions
    WHERE move_log_id = NEW.move_log_id
    ORDER BY version DESC
    LIMIT 1;

  IF NEW.version <> COALESCE(latest_version, 0) + 1 THEN
    RAISE EXCEPTION 'move log % must publish version %, not %',
      NEW.move_log_id, COALESCE(latest_version, 0) + 1, NEW.version
      USING ERRCODE = 'check_violation';
  END IF;

  IF latest_published_at IS NOT NULL AND NEW.published_at < latest_published_at THEN
    RAISE EXCEPTION 'move log % revision % is published before revision %',
      NEW.move_log_id, NEW.version, latest_version
      USING ERRCODE = 'check_violation';
  END IF;

  IF cardinality(NEW.evidence_ids) <> (SELECT count(DISTINCT e) FROM unnest(NEW.evidence_ids) AS e) THEN
    RAISE EXCEPTION 'move log % revision % links the same evidence twice', NEW.move_log_id, NEW.version
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT linked INTO foreign_evidence
    FROM unnest(NEW.evidence_ids) AS linked
    WHERE NOT EXISTS (
      SELECT 1 FROM evidence WHERE evidence.id = linked AND evidence.event_id = log_event_id
    )
    LIMIT 1;

  IF foreign_evidence IS NOT NULL THEN
    RAISE EXCEPTION 'move log % revision % links evidence % that is not recorded on event %',
      NEW.move_log_id, NEW.version, foreign_evidence, log_event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER move_log_revisions_check
  BEFORE INSERT ON move_log_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_check_move_log_revision();

-- An event is only meaningful with at least one probability observation.
-- Checked at commit so the event and its first observation share a transaction.
CREATE FUNCTION omen_require_event_observation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM probability_observations WHERE event_id = NEW.id) THEN
    RAISE EXCEPTION 'event % has no probability observation', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER events_require_observation
  AFTER INSERT ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION omen_require_event_observation();

CREATE TRIGGER probability_observations_append_only
  BEFORE UPDATE OR DELETE ON probability_observations
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER probability_observations_no_truncate
  BEFORE TRUNCATE ON probability_observations
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE TRIGGER evidence_append_only
  BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER evidence_no_truncate
  BEFORE TRUNCATE ON evidence
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE TRIGGER move_logs_append_only
  BEFORE UPDATE OR DELETE ON move_logs
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER move_logs_no_truncate
  BEFORE TRUNCATE ON move_logs
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE TRIGGER move_log_revisions_append_only
  BEFORE UPDATE OR DELETE ON move_log_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER move_log_revisions_no_truncate
  BEFORE TRUNCATE ON move_log_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();
