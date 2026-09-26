-- OMEN V0 Task 04A: trustworthy temporal storage.
--
-- Adds append-only event_revisions for reconstructible semantic fields, a global
-- history coverage baseline, and record_available_at on every history row.
-- record_available_at is always set at insert time (never caller-supplied;
-- transaction_timestamp() within each write transaction) and marks when a row
-- became available for point-in-time reconstruction. Existing rows receive the
-- migration timestamp, not backdated capture times.

CREATE TABLE omen_history_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CONSTRAINT omen_history_coverage_singleton CHECK (singleton),
  -- Event question/status/deadline history is only trustworthy from this instant forward.
  semantic_event_fields_from timestamptz NOT NULL,
  -- When pre-existing history rows were aligned to trustworthy record availability.
  record_availability_realigned_at timestamptz NOT NULL
);

INSERT INTO omen_history_coverage (singleton, semantic_event_fields_from, record_availability_realigned_at)
SELECT true, baseline.ts, baseline.ts
  FROM (SELECT clock_timestamp() AS ts) AS baseline;

ALTER TABLE probability_observations
  ADD COLUMN record_available_at timestamptz;

ALTER TABLE evidence
  ADD COLUMN record_available_at timestamptz;

ALTER TABLE move_log_revisions
  ADD COLUMN record_available_at timestamptz;

-- Append-only triggers from 0001 reject UPDATE; disable only for this one-time realignment.
ALTER TABLE probability_observations DISABLE TRIGGER probability_observations_append_only;
ALTER TABLE evidence DISABLE TRIGGER evidence_append_only;
ALTER TABLE move_log_revisions DISABLE TRIGGER move_log_revisions_append_only;

UPDATE probability_observations
   SET record_available_at = (SELECT record_availability_realigned_at FROM omen_history_coverage);
UPDATE evidence
   SET record_available_at = (SELECT record_availability_realigned_at FROM omen_history_coverage);
UPDATE move_log_revisions
   SET record_available_at = (SELECT record_availability_realigned_at FROM omen_history_coverage);

ALTER TABLE probability_observations ENABLE TRIGGER probability_observations_append_only;
ALTER TABLE evidence ENABLE TRIGGER evidence_append_only;
ALTER TABLE move_log_revisions ENABLE TRIGGER move_log_revisions_append_only;

ALTER TABLE probability_observations
  ALTER COLUMN record_available_at SET NOT NULL;

ALTER TABLE evidence
  ALTER COLUMN record_available_at SET NOT NULL;

ALTER TABLE move_log_revisions
  ALTER COLUMN record_available_at SET NOT NULL;

CREATE FUNCTION omen_assign_record_available_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Fixed for the whole transaction so one bundle shares one reconstruction instant.
  NEW.record_available_at := transaction_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER probability_observations_record_available
  BEFORE INSERT ON probability_observations
  FOR EACH ROW EXECUTE FUNCTION omen_assign_record_available_at();

CREATE TRIGGER evidence_record_available
  BEFORE INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION omen_assign_record_available_at();

CREATE TRIGGER move_log_revisions_record_available
  BEFORE INSERT ON move_log_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_assign_record_available_at();

CREATE TABLE event_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  version integer NOT NULL
    CONSTRAINT event_revisions_version_positive CHECK (version >= 1),
  title text NOT NULL
    CONSTRAINT event_revisions_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  question text NOT NULL
    CONSTRAINT event_revisions_question_precise CHECK (
      char_length(btrim(question)) BETWEEN 15 AND 500 AND right(btrim(question), 1) = '?'
    ),
  status text NOT NULL
    CONSTRAINT event_revisions_status_known CHECK (status IN ('watch', 'active', 'resolved')),
  deadline timestamptz NOT NULL,
  resolution_criteria text NOT NULL
    CONSTRAINT event_revisions_resolution_criteria_length CHECK (char_length(btrim(resolution_criteria)) >= 20),
  category text NOT NULL
    CONSTRAINT event_revisions_category_known CHECK (category IN (
      'AI', 'Technology', 'Economics', 'Geopolitics', 'Companies',
      'Regulation', 'Markets', 'Energy', 'Crypto', 'Science'
    )),
  significance text NOT NULL
    CONSTRAINT event_revisions_significance_known CHECK (significance IN ('critical', 'high', 'medium', 'low')),
  region text NOT NULL,
  summary text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  related_event_ids text[] NOT NULL DEFAULT '{}'
    CONSTRAINT event_revisions_not_self_related CHECK (NOT (event_id = ANY (related_event_ids))),
  provenance text NOT NULL
    CONSTRAINT event_revisions_provenance_known CHECK (provenance IN ('demo', 'sourced')),
  correction_note text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  record_available_at timestamptz NOT NULL,
  CONSTRAINT event_revisions_unique_version UNIQUE (event_id, version),
  CONSTRAINT event_revisions_correction_note CHECK (
    (version = 1 AND correction_note IS NULL)
    OR (version > 1 AND correction_note IS NOT NULL AND char_length(btrim(correction_note)) > 0)
  )
);

CREATE INDEX event_revisions_event_version ON event_revisions (event_id, version);

CREATE TRIGGER event_revisions_record_available
  BEFORE INSERT ON event_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_assign_record_available_at();

-- Serialises version allocation; enforces consecutive versions from 1.
CREATE FUNCTION omen_check_event_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  latest_version integer;
BEGIN
  PERFORM 1 FROM events WHERE id = NEW.event_id FOR UPDATE;

  SELECT version INTO latest_version
    FROM event_revisions
    WHERE event_id = NEW.event_id
    ORDER BY version DESC
    LIMIT 1;

  IF NEW.version <> COALESCE(latest_version, 0) + 1 THEN
    RAISE EXCEPTION 'event % must publish revision %, not %',
      NEW.event_id, COALESCE(latest_version, 0) + 1, NEW.version
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER event_revisions_check
  BEFORE INSERT ON event_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_check_event_revision();

CREATE TRIGGER event_revisions_append_only
  BEFORE UPDATE OR DELETE ON event_revisions
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER event_revisions_no_truncate
  BEFORE TRUNCATE ON event_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

-- Projection updates to versioned event fields must go through the write path.
CREATE FUNCTION omen_guard_event_semantic_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('omen.allow_event_projection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.question IS DISTINCT FROM OLD.question
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deadline IS DISTINCT FROM OLD.deadline
     OR NEW.resolution_criteria IS DISTINCT FROM OLD.resolution_criteria
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.significance IS DISTINCT FROM OLD.significance
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.tags IS DISTINCT FROM OLD.tags
     OR NEW.related_event_ids IS DISTINCT FROM OLD.related_event_ids
     OR NEW.provenance IS DISTINCT FROM OLD.provenance THEN
    RAISE EXCEPTION 'event % semantic fields are revision-controlled; use the OMEN write path', NEW.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_guard_semantic_projection
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION omen_guard_event_semantic_projection();
