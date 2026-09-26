-- OMEN V0: immutable verified history checkpoints.
--
-- Migration 0002 comments describe record_available_at as the instant a row
-- became available for point-in-time reconstruction. That claim is wrong:
-- the column stores transaction_timestamp(), which is transaction start, and
-- other snapshots cannot see the row until commit. This migration does not
-- rewrite 0002 or any history row. It labels record_available_at as a recording
-- marker and adds the only visibility claim V0 stores: a checkpoint of members
-- that were visible together in the publishing statement's snapshot.
--
-- There is deliberately no as-of(timestamp) function. Arbitrary wall-clock
-- reconstruction is not provided.

COMMENT ON COLUMN probability_observations.record_available_at IS
  'Start of the inserting transaction (transaction_timestamp()). Shared by rows that transaction inserts. Not commit visibility and not a reconstruction predicate.';

COMMENT ON COLUMN evidence.record_available_at IS
  'Start of the inserting transaction (transaction_timestamp()). Shared by rows that transaction inserts. Not commit visibility and not a reconstruction predicate.';

COMMENT ON COLUMN move_log_revisions.record_available_at IS
  'Start of the inserting transaction (transaction_timestamp()). Shared by rows that transaction inserts. Not commit visibility and not a reconstruction predicate.';

COMMENT ON COLUMN event_revisions.record_available_at IS
  'Start of the inserting transaction (transaction_timestamp()). Shared by rows that transaction inserts. Not commit visibility and not a reconstruction predicate.';

CREATE FUNCTION omen_reject_coverage_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'omen_history_coverage is immutable after migration 0002'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER omen_history_coverage_immutable
  BEFORE UPDATE OR DELETE ON omen_history_coverage
  FOR EACH ROW EXECUTE FUNCTION omen_reject_coverage_mutation();

CREATE TRIGGER omen_history_coverage_no_truncate
  BEFORE TRUNCATE ON omen_history_coverage
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_coverage_mutation();

CREATE FUNCTION omen_canon_ts(p_value timestamptz) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  END
$$;

-- Canonical payload for one history row. NULL when the row is absent.
CREATE FUNCTION omen_history_row_line(p_relation text, p_row_key text) RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  line text;
BEGIN
  IF p_relation = 'probability_observations' THEN
    SELECT jsonb_build_array(
      'probability_observations', id::text, event_id, source_kind, source_name, probability_type,
      probability_pct::text, omen_canon_ts(observed_at), omen_canon_ts(captured_at), note, provenance,
      omen_canon_ts(record_available_at)
    )::text INTO line
      FROM probability_observations WHERE id = p_row_key::bigint;
  ELSIF p_relation = 'evidence' THEN
    SELECT jsonb_build_array(
      'evidence', id, event_id, source_name, source_url, omen_canon_ts(source_published_at),
      omen_canon_ts(first_observed_at), omen_canon_ts(captured_at), summary, stance, reliability::text,
      recorded_by, provenance, omen_canon_ts(record_available_at)
    )::text INTO line
      FROM evidence WHERE id = p_row_key;
  ELSIF p_relation = 'move_log_revisions' THEN
    SELECT jsonb_build_array(
      'move_log_revisions', id::text, move_log_id, version::text, omen_canon_ts(published_at),
      omen_canon_ts(recorded_at), author, what_changed, likely_cause, explained_pct::text,
      to_jsonb(unexplained_factors), to_jsonb(evidence_ids), correction_note, provenance,
      omen_canon_ts(record_available_at)
    )::text INTO line
      FROM move_log_revisions WHERE id = p_row_key::bigint;
  ELSIF p_relation = 'event_revisions' THEN
    SELECT jsonb_build_array(
      'event_revisions', id::text, event_id, version::text, title, question, status,
      omen_canon_ts(deadline), resolution_criteria, category, significance, region, summary,
      to_jsonb(tags), to_jsonb(related_event_ids), provenance, correction_note,
      omen_canon_ts(recorded_at), omen_canon_ts(record_available_at)
    )::text INTO line
      FROM event_revisions WHERE id = p_row_key::bigint;
  ELSE
    RAISE EXCEPTION 'unknown history relation %', p_relation
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN line;
END;
$$;

CREATE FUNCTION omen_digest_piece(p_relation text, p_row_key text, p_line text) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_relation || E'\t' || p_row_key || E'\t' || p_line
$$;

-- History rows for one event whose inserting transaction is visible in p_snapshot.
-- The table scan uses the statement snapshot; p_snapshot selects which of those
-- rows belong to the checkpoint. Own uncommitted inserts are not visible in it.
CREATE FUNCTION omen_visible_history_members(p_event_id text, p_snapshot pg_snapshot)
RETURNS TABLE (relation_name text, row_key text, inserting_xid xid8, line text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT 'event_revisions', id::text, xmin::text::xid8, omen_history_row_line('event_revisions', id::text)
    FROM event_revisions
   WHERE event_id = p_event_id
     AND pg_visible_in_snapshot(xmin::text::xid8, p_snapshot)
  UNION ALL
  SELECT 'probability_observations', id::text, xmin::text::xid8,
         omen_history_row_line('probability_observations', id::text)
    FROM probability_observations
   WHERE event_id = p_event_id
     AND pg_visible_in_snapshot(xmin::text::xid8, p_snapshot)
  UNION ALL
  SELECT 'evidence', id, xmin::text::xid8, omen_history_row_line('evidence', id)
    FROM evidence
   WHERE event_id = p_event_id
     AND pg_visible_in_snapshot(xmin::text::xid8, p_snapshot)
  UNION ALL
  SELECT 'move_log_revisions', r.id::text, r.xmin::text::xid8,
         omen_history_row_line('move_log_revisions', r.id::text)
    FROM move_log_revisions r
    JOIN move_logs m ON m.id = r.move_log_id
   WHERE m.event_id = p_event_id
     AND pg_visible_in_snapshot(r.xmin::text::xid8, p_snapshot)
$$;

CREATE FUNCTION omen_visible_history_members(p_event_id text)
RETURNS TABLE (relation_name text, row_key text, inserting_xid xid8, line text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT * FROM omen_visible_history_members(p_event_id, pg_current_snapshot())
$$;

CREATE FUNCTION omen_event_has_uncommitted_history(p_event_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM probability_observations
     WHERE event_id = p_event_id
       AND NOT pg_visible_in_snapshot(xmin::text::xid8, pg_current_snapshot())
  )
  OR EXISTS (
    SELECT 1 FROM evidence
     WHERE event_id = p_event_id
       AND NOT pg_visible_in_snapshot(xmin::text::xid8, pg_current_snapshot())
  )
  OR EXISTS (
    SELECT 1 FROM move_log_revisions r
      JOIN move_logs m ON m.id = r.move_log_id
     WHERE m.event_id = p_event_id
       AND NOT pg_visible_in_snapshot(r.xmin::text::xid8, pg_current_snapshot())
  )
  OR EXISTS (
    SELECT 1 FROM event_revisions
     WHERE event_id = p_event_id
       AND NOT pg_visible_in_snapshot(xmin::text::xid8, pg_current_snapshot())
  );
$$;

CREATE TABLE history_checkpoints (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  sequence integer NOT NULL
    CONSTRAINT history_checkpoints_sequence_positive CHECK (sequence >= 1),
  -- Snapshot capture: the publishing statement's pg_current_snapshot().
  -- Compared as text because pg_snapshot has no equality operator.
  observed_snapshot pg_snapshot NOT NULL,
  content_md5 text NOT NULL
    CONSTRAINT history_checkpoints_content_md5_hex CHECK (content_md5 ~ '^[0-9a-f]{32}$'),
  member_count integer NOT NULL
    CONSTRAINT history_checkpoints_member_count_positive CHECK (member_count >= 1),
  semantic_history text NOT NULL
    CONSTRAINT history_checkpoints_semantic_history_known CHECK (semantic_history IN ('recorded', 'unavailable')),
  semantic_event_fields_from timestamptz NOT NULL,
  record_availability_realigned_at timestamptz NOT NULL,
  -- Migration 0002 never backfilled event_revisions. Checkpoints must not invent them.
  pre_baseline_event_revisions text NOT NULL
    CONSTRAINT history_checkpoints_pre_baseline_not_recorded CHECK (pre_baseline_event_revisions = 'not_recorded'),
  -- The only visibility claim V0 stores.
  visibility_contract text NOT NULL
    CONSTRAINT history_checkpoints_visibility_contract CHECK (visibility_contract = 'observed_snapshot_members'),
  CONSTRAINT history_checkpoints_unique_sequence UNIQUE (event_id, sequence)
);

COMMENT ON TABLE history_checkpoints IS
  'Immutable verified reconstruction points. A row asserts only that its members were visible together in observed_snapshot. It does not assert wall-clock visibility, commit time, or any instant before the checkpoint transaction committed.';

CREATE INDEX history_checkpoints_event_sequence ON history_checkpoints (event_id, sequence DESC);

CREATE TABLE history_checkpoint_members (
  checkpoint_id bigint NOT NULL REFERENCES history_checkpoints (id) ON DELETE RESTRICT,
  relation_name text NOT NULL
    CONSTRAINT history_checkpoint_members_relation_known CHECK (relation_name IN (
      'probability_observations', 'evidence', 'move_log_revisions', 'event_revisions'
    )),
  row_key text NOT NULL,
  inserting_xid xid8 NOT NULL,
  PRIMARY KEY (checkpoint_id, relation_name, row_key)
);

CREATE FUNCTION omen_guard_history_checkpoint() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- One capture. A later pg_current_snapshot() in this statement can move
  -- forward when this transaction takes an xid or another transaction commits.
  snap pg_snapshot := pg_current_snapshot();
  visible_digest text;
  visible_count integer;
  has_semantic boolean;
  coverage_from timestamptz;
  coverage_realigned timestamptz;
  latest_digest text;
BEGIN
  NEW.observed_snapshot := snap;

  IF omen_event_has_uncommitted_history(NEW.event_id) THEN
    RAISE EXCEPTION 'refusing to publish a checkpoint for event % while this transaction has uncommitted history', NEW.event_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.pre_baseline_event_revisions IS DISTINCT FROM 'not_recorded'
     OR NEW.visibility_contract IS DISTINCT FROM 'observed_snapshot_members' THEN
    RAISE EXCEPTION 'history checkpoint visibility contract is observed_snapshot_members with no pre-migration event revisions'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT semantic_event_fields_from, record_availability_realigned_at
    INTO coverage_from, coverage_realigned
    FROM omen_history_coverage;
  IF NEW.semantic_event_fields_from IS DISTINCT FROM coverage_from
     OR NEW.record_availability_realigned_at IS DISTINCT FROM coverage_realigned THEN
    RAISE EXCEPTION 'history checkpoint coverage baseline does not match omen_history_coverage'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT md5(coalesce(string_agg(
           omen_digest_piece(relation_name, row_key, line),
           E'\n' ORDER BY relation_name, row_key), '')),
         count(*)::integer,
         coalesce(bool_or(relation_name = 'event_revisions'), false)
    INTO visible_digest, visible_count, has_semantic
    FROM omen_visible_history_members(NEW.event_id, snap);

  IF visible_count = 0 THEN
    RAISE EXCEPTION 'refusing to publish an empty history checkpoint for event %', NEW.event_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  NEW.content_md5 := visible_digest;
  NEW.member_count := visible_count;
  NEW.semantic_history := CASE WHEN has_semantic THEN 'recorded' ELSE 'unavailable' END;

  SELECT content_md5 INTO latest_digest
    FROM history_checkpoints
   WHERE event_id = NEW.event_id
   ORDER BY sequence DESC
   LIMIT 1;
  IF latest_digest IS NOT NULL AND latest_digest = NEW.content_md5 THEN
    RETURN NULL;
  END IF;

  IF NEW.sequence IS DISTINCT FROM COALESCE((
    SELECT max(sequence) FROM history_checkpoints WHERE event_id = NEW.event_id
  ), 0) + 1 THEN
    RAISE EXCEPTION 'history checkpoint sequence for event % must be consecutive', NEW.event_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER history_checkpoints_guard
  BEFORE INSERT ON history_checkpoints
  FOR EACH ROW EXECUTE FUNCTION omen_guard_history_checkpoint();

-- Members are copied from the snapshot stored on the checkpoint, not from a
-- second pg_current_snapshot() call.
CREATE FUNCTION omen_insert_checkpoint_members() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO history_checkpoint_members (checkpoint_id, relation_name, row_key, inserting_xid)
  SELECT NEW.id, relation_name, row_key, inserting_xid
    FROM omen_visible_history_members(NEW.event_id, NEW.observed_snapshot);
  RETURN NULL;
END;
$$;

CREATE TRIGGER history_checkpoints_insert_members
  AFTER INSERT ON history_checkpoints
  FOR EACH ROW EXECUTE FUNCTION omen_insert_checkpoint_members();

CREATE FUNCTION omen_guard_checkpoint_member() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_xid xid8;
  observed pg_snapshot;
  live_xid xid8;
BEGIN
  SELECT xmin::text::xid8, observed_snapshot
    INTO parent_xid, observed
    FROM history_checkpoints
   WHERE id = NEW.checkpoint_id;
  IF parent_xid IS NULL THEN
    RAISE EXCEPTION 'history checkpoint % does not exist', NEW.checkpoint_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF parent_xid IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'history checkpoint members must be written by the publishing transaction'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.relation_name = 'probability_observations' THEN
    SELECT xmin::text::xid8 INTO live_xid FROM probability_observations WHERE id = NEW.row_key::bigint;
  ELSIF NEW.relation_name = 'evidence' THEN
    SELECT xmin::text::xid8 INTO live_xid FROM evidence WHERE id = NEW.row_key;
  ELSIF NEW.relation_name = 'move_log_revisions' THEN
    SELECT xmin::text::xid8 INTO live_xid FROM move_log_revisions WHERE id = NEW.row_key::bigint;
  ELSIF NEW.relation_name = 'event_revisions' THEN
    SELECT xmin::text::xid8 INTO live_xid FROM event_revisions WHERE id = NEW.row_key::bigint;
  ELSE
    RAISE EXCEPTION 'unknown history relation %', NEW.relation_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF live_xid IS NULL THEN
    RAISE EXCEPTION 'history checkpoint member %.% does not exist', NEW.relation_name, NEW.row_key
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.inserting_xid IS DISTINCT FROM live_xid THEN
    RAISE EXCEPTION 'history checkpoint member xid does not match %.%', NEW.relation_name, NEW.row_key
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT pg_visible_in_snapshot(NEW.inserting_xid, observed) THEN
    RAISE EXCEPTION 'history checkpoint member %.% was not visible in the observed snapshot', NEW.relation_name, NEW.row_key
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER history_checkpoint_members_guard
  BEFORE INSERT ON history_checkpoint_members
  FOR EACH ROW EXECUTE FUNCTION omen_guard_checkpoint_member();

-- Count members written in this statement. Re-reading history here can see a
-- commit that landed after the publishing statement chose its members.
CREATE FUNCTION omen_checkpoint_member_count_matches() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actual integer;
BEGIN
  SELECT count(*)::integer INTO actual
    FROM history_checkpoint_members
   WHERE checkpoint_id = NEW.id;
  IF actual IS DISTINCT FROM NEW.member_count THEN
    RAISE EXCEPTION 'history checkpoint members do not match the history visible in the publishing snapshot'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER history_checkpoints_members_complete
  AFTER INSERT ON history_checkpoints
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION omen_checkpoint_member_count_matches();

CREATE TRIGGER history_checkpoints_append_only
  BEFORE UPDATE OR DELETE ON history_checkpoints
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER history_checkpoints_no_truncate
  BEFORE TRUNCATE ON history_checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE TRIGGER history_checkpoint_members_append_only
  BEFORE UPDATE OR DELETE ON history_checkpoint_members
  FOR EACH ROW EXECUTE FUNCTION omen_reject_history_mutation();
CREATE TRIGGER history_checkpoint_members_no_truncate
  BEFORE TRUNCATE ON history_checkpoint_members
  FOR EACH STATEMENT EXECUTE FUNCTION omen_reject_history_mutation();

CREATE FUNCTION omen_verify_history_checkpoint(p_checkpoint_id bigint) RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  cp history_checkpoints%ROWTYPE;
  recomputed text;
  stored_count integer;
  missing integer;
  invisible integer;
  semantic_members integer;
  coverage_from timestamptz;
  coverage_realigned timestamptz;
BEGIN
  SELECT * INTO cp FROM history_checkpoints WHERE id = p_checkpoint_id;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  IF cp.visibility_contract IS DISTINCT FROM 'observed_snapshot_members' THEN
    RETURN 'visibility-contract';
  END IF;
  IF cp.pre_baseline_event_revisions IS DISTINCT FROM 'not_recorded' THEN
    RETURN 'pre-baseline';
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE omen_history_row_line(relation_name, row_key) IS NULL)::integer,
         count(*) FILTER (WHERE NOT pg_visible_in_snapshot(inserting_xid, cp.observed_snapshot))::integer
    INTO stored_count, missing, invisible
    FROM history_checkpoint_members
   WHERE checkpoint_id = p_checkpoint_id;

  IF missing > 0 THEN
    RETURN 'member-row-missing';
  END IF;
  IF invisible > 0 THEN
    RETURN 'member-not-visible-in-snapshot';
  END IF;
  IF stored_count IS DISTINCT FROM cp.member_count THEN
    RETURN 'member-count-mismatch';
  END IF;

  SELECT count(*)::integer INTO semantic_members
    FROM history_checkpoint_members
   WHERE checkpoint_id = p_checkpoint_id AND relation_name = 'event_revisions';
  IF cp.semantic_history = 'recorded' AND semantic_members = 0 THEN
    RETURN 'semantic-history-label';
  END IF;
  IF cp.semantic_history = 'unavailable' AND semantic_members > 0 THEN
    RETURN 'semantic-history-label';
  END IF;

  SELECT md5(coalesce(string_agg(
           omen_digest_piece(relation_name, row_key, omen_history_row_line(relation_name, row_key)),
           E'\n' ORDER BY relation_name, row_key), ''))
    INTO recomputed
    FROM history_checkpoint_members
   WHERE checkpoint_id = p_checkpoint_id;
  IF recomputed IS DISTINCT FROM cp.content_md5 THEN
    RETURN 'digest-mismatch';
  END IF;

  SELECT semantic_event_fields_from, record_availability_realigned_at
    INTO coverage_from, coverage_realigned
    FROM omen_history_coverage;
  IF cp.semantic_event_fields_from IS DISTINCT FROM coverage_from
     OR cp.record_availability_realigned_at IS DISTINCT FROM coverage_realigned THEN
    RETURN 'coverage-baseline-mismatch';
  END IF;

  RETURN 'ok';
END;
$$;

-- Publishes the history visible to this statement, or returns the latest checkpoint
-- when that history is unchanged. The snapshot is captured in this statement.
-- Callers must not be holding uncommitted history for the event.
CREATE FUNCTION omen_publish_history_checkpoint(p_event_id text)
RETURNS TABLE (
  checkpoint_id bigint,
  sequence integer,
  created boolean,
  semantic_history text,
  content_md5 text
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
BEGIN
  -- Serialise publishers without FOR UPDATE. A row lock conflicts with the
  -- KEY SHARE lock an in-flight history insert holds on events, and would
  -- wait until that writer commits.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id, 0));
  PERFORM 1 FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % does not exist', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;
  -- Run before the idempotent return. Visible-history digest omits this
  -- transaction's inserts, so an unchanged digest must not look like success.
  IF omen_event_has_uncommitted_history(p_event_id) THEN
    RAISE EXCEPTION 'refusing to publish a checkpoint for event % while this transaction has uncommitted history', p_event_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN QUERY
  WITH baseline AS (
    SELECT semantic_event_fields_from, record_availability_realigned_at
      FROM omen_history_coverage
  ),
  inserted AS (
    INSERT INTO history_checkpoints (
      event_id, sequence, observed_snapshot, content_md5, member_count, semantic_history,
      semantic_event_fields_from, record_availability_realigned_at,
      pre_baseline_event_revisions, visibility_contract
    )
    SELECT p_event_id,
           coalesce((SELECT max(sequence) FROM history_checkpoints WHERE event_id = p_event_id), 0) + 1,
           pg_current_snapshot(),
           repeat('0', 32),
           1,
           'unavailable',
           baseline.semantic_event_fields_from,
           baseline.record_availability_realigned_at,
           'not_recorded',
           'observed_snapshot_members'
      FROM baseline
    RETURNING id, history_checkpoints.sequence, history_checkpoints.semantic_history, history_checkpoints.content_md5
  )
  SELECT inserted.id, inserted.sequence, true, inserted.semantic_history, inserted.content_md5
    FROM inserted
  UNION ALL
  (
    SELECT existing.id, existing.sequence, false, existing.semantic_history, existing.content_md5
      FROM history_checkpoints existing
     WHERE existing.event_id = p_event_id
       AND NOT EXISTS (SELECT 1 FROM inserted)
     ORDER BY existing.sequence DESC
     LIMIT 1
  );
END;
$$;
