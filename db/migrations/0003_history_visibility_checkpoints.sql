-- OMEN V0: verified history checkpoints.
--
-- record_available_at (migration 0002) is the writing transaction's start time,
-- transaction_timestamp(), shared by every row inserted in that transaction.
-- It is earlier than commit, so record_available_at <= T is not a visibility
-- predicate and this migration does not query by it.
--
-- A historical view is a published checkpoint: one later repeatable-read
-- transaction records the history rows of a single event that its snapshot
-- already saw, with each row's inserting transaction id. Reconstruction reads
-- those member keys. It does not read the events projection and it does not
-- accept a wall-clock cutoff.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION omen_canon_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT CASE
    WHEN value IS NULL THEN '\N'
    ELSE replace(replace(replace(replace(replace(value,
      E'\\', E'\\\\'),
      chr(31), E'\\x1f'),
      chr(30), E'\\x1e'),
      chr(10), E'\\n'),
      chr(13), E'\\r')
  END
$hist$;

CREATE FUNCTION omen_canon_ts(value timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT CASE
    WHEN value IS NULL THEN '\N'
    ELSE to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  END
$hist$;

CREATE FUNCTION omen_canon_numeric(value numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT CASE
    WHEN value IS NULL THEN '\N'
    ELSE trim(to_char(value, '999990.00'))
  END
$hist$;

CREATE FUNCTION omen_canon_text_array(value text[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT CASE
    WHEN value IS NULL THEN '\N'
    ELSE coalesce((
      SELECT string_agg(omen_canon_text(item), chr(30) ORDER BY ordinality)
        FROM unnest(value) WITH ORDINALITY AS item_row(item, ordinality)
    ), '')
  END
$hist$;

CREATE FUNCTION omen_canonical_observation(
  id bigint,
  event_id text,
  source_kind text,
  source_name text,
  probability_type text,
  probability_pct numeric,
  observed_at timestamptz,
  captured_at timestamptz,
  note text,
  provenance text,
  record_available_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT concat_ws(chr(31),
    'probability_observations',
    id::text,
    omen_canon_text(event_id),
    omen_canon_text(source_kind),
    omen_canon_text(source_name),
    omen_canon_text(probability_type),
    omen_canon_numeric(probability_pct),
    omen_canon_ts(observed_at),
    omen_canon_ts(captured_at),
    omen_canon_text(note),
    omen_canon_text(provenance),
    omen_canon_ts(record_available_at)
  )
$hist$;

-- concat_ws skips NULL arguments. Canon helpers never return NULL, so every
-- field stays in the line, including explicit '\N' for stored NULLs.

CREATE FUNCTION omen_canonical_evidence(
  id text,
  event_id text,
  source_name text,
  source_url text,
  source_published_at timestamptz,
  first_observed_at timestamptz,
  captured_at timestamptz,
  summary text,
  stance text,
  reliability numeric,
  recorded_by text,
  provenance text,
  record_available_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT concat_ws(chr(31),
    'evidence',
    omen_canon_text(id),
    omen_canon_text(event_id),
    omen_canon_text(source_name),
    omen_canon_text(source_url),
    omen_canon_ts(source_published_at),
    omen_canon_ts(first_observed_at),
    omen_canon_ts(captured_at),
    omen_canon_text(summary),
    omen_canon_text(stance),
    omen_canon_numeric(reliability),
    omen_canon_text(recorded_by),
    omen_canon_text(provenance),
    omen_canon_ts(record_available_at)
  )
$hist$;

CREATE FUNCTION omen_canonical_move_log_revision(
  id bigint,
  event_id text,
  move_log_id text,
  version integer,
  published_at timestamptz,
  recorded_at timestamptz,
  author text,
  what_changed text,
  likely_cause text,
  explained_pct numeric,
  unexplained_factors text[],
  evidence_ids text[],
  correction_note text,
  provenance text,
  record_available_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT concat_ws(chr(31),
    'move_log_revisions',
    id::text,
    omen_canon_text(event_id),
    omen_canon_text(move_log_id),
    version::text,
    omen_canon_ts(published_at),
    omen_canon_ts(recorded_at),
    omen_canon_text(author),
    omen_canon_text(what_changed),
    omen_canon_text(likely_cause),
    omen_canon_numeric(explained_pct),
    omen_canon_text_array(unexplained_factors),
    omen_canon_text_array(evidence_ids),
    omen_canon_text(correction_note),
    omen_canon_text(provenance),
    omen_canon_ts(record_available_at)
  )
$hist$;

CREATE FUNCTION omen_canonical_event_revision(
  id bigint,
  event_id text,
  version integer,
  title text,
  question text,
  status text,
  deadline timestamptz,
  resolution_criteria text,
  category text,
  significance text,
  region text,
  summary text,
  tags text[],
  related_event_ids text[],
  provenance text,
  correction_note text,
  recorded_at timestamptz,
  record_available_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE AS $hist$
  SELECT concat_ws(chr(31),
    'event_revisions',
    id::text,
    omen_canon_text(event_id),
    version::text,
    omen_canon_text(title),
    omen_canon_text(question),
    omen_canon_text(status),
    omen_canon_ts(deadline),
    omen_canon_text(resolution_criteria),
    omen_canon_text(category),
    omen_canon_text(significance),
    omen_canon_text(region),
    omen_canon_text(summary),
    omen_canon_text_array(tags),
    omen_canon_text_array(related_event_ids),
    omen_canon_text(provenance),
    omen_canon_text(correction_note),
    omen_canon_ts(recorded_at),
    omen_canon_ts(record_available_at)
  )
$hist$;

-- Rows visible to this transaction's snapshot. The inserting xid is recorded
-- so a later check can prove the publishing snapshot saw that transaction.
-- record_available_at is part of the digest payload only. It is not a filter.
CREATE FUNCTION omen_visible_history_members(p_event_id text)
RETURNS TABLE (relation_name text, row_key text, inserting_xid xid8, line text)
LANGUAGE sql STABLE AS $hist$
  SELECT 'event_revisions', revision.id::text, revision.xmin::text::xid8,
         omen_canonical_event_revision(
           revision.id, revision.event_id, revision.version, revision.title, revision.question,
           revision.status, revision.deadline, revision.resolution_criteria, revision.category,
           revision.significance, revision.region, revision.summary, revision.tags,
           revision.related_event_ids, revision.provenance, revision.correction_note,
           revision.recorded_at, revision.record_available_at
         )
    FROM event_revisions AS revision
   WHERE revision.event_id = p_event_id
     AND pg_visible_in_snapshot(revision.xmin::text::xid8, pg_current_snapshot())
  UNION ALL
  SELECT 'probability_observations', observation.id::text, observation.xmin::text::xid8,
         omen_canonical_observation(
           observation.id, observation.event_id, observation.source_kind, observation.source_name,
           observation.probability_type, observation.probability_pct, observation.observed_at,
           observation.captured_at, observation.note, observation.provenance, observation.record_available_at
         )
    FROM probability_observations AS observation
   WHERE observation.event_id = p_event_id
     AND pg_visible_in_snapshot(observation.xmin::text::xid8, pg_current_snapshot())
  UNION ALL
  SELECT 'evidence', item.id, item.xmin::text::xid8,
         omen_canonical_evidence(
           item.id, item.event_id, item.source_name, item.source_url, item.source_published_at,
           item.first_observed_at, item.captured_at, item.summary, item.stance, item.reliability,
           item.recorded_by, item.provenance, item.record_available_at
         )
    FROM evidence AS item
   WHERE item.event_id = p_event_id
     AND pg_visible_in_snapshot(item.xmin::text::xid8, pg_current_snapshot())
  UNION ALL
  SELECT 'move_log_revisions', revision.id::text, revision.xmin::text::xid8,
         omen_canonical_move_log_revision(
           revision.id, log.event_id, revision.move_log_id, revision.version, revision.published_at,
           revision.recorded_at, revision.author, revision.what_changed, revision.likely_cause,
           revision.explained_pct, revision.unexplained_factors, revision.evidence_ids,
           revision.correction_note, revision.provenance, revision.record_available_at
         )
    FROM move_log_revisions AS revision
    JOIN move_logs AS log ON log.id = revision.move_log_id
   WHERE log.event_id = p_event_id
     AND pg_visible_in_snapshot(revision.xmin::text::xid8, pg_current_snapshot())
$hist$;

CREATE FUNCTION omen_visible_history_digest(p_event_id text)
RETURNS TABLE (content_sha256 text, member_count integer, semantic_history text)
LANGUAGE sql STABLE AS $hist$
  SELECT encode(
           public.digest(
             convert_to(coalesce(string_agg(member.line, chr(10) ORDER BY member.relation_name, member.row_key), ''), 'UTF8'),
             'sha256'
           ),
           'hex'
         ),
         count(*)::integer,
         CASE
           WHEN bool_or(member.relation_name = 'event_revisions') THEN 'recorded'
           ELSE 'unavailable'
         END
    FROM omen_visible_history_members(p_event_id) AS member
$hist$;

CREATE TABLE history_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  sequence integer NOT NULL
    CONSTRAINT history_checkpoints_sequence_positive CHECK (sequence >= 1),
  -- Snapshot identity of the publishing statement. Not a wall-clock instant.
  observed_snapshot pg_snapshot NOT NULL,
  content_sha256 text NOT NULL
    CONSTRAINT history_checkpoints_sha256 CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  member_count integer NOT NULL
    CONSTRAINT history_checkpoints_member_count_positive CHECK (member_count >= 1),
  semantic_history text NOT NULL
    CONSTRAINT history_checkpoints_semantic_history CHECK (semantic_history IN ('recorded', 'unavailable')),
  semantic_event_fields_from timestamptz NOT NULL,
  record_availability_realigned_at timestamptz NOT NULL,
  pre_baseline_event_revisions text NOT NULL DEFAULT 'not_recorded'
    CONSTRAINT history_checkpoints_pre_baseline CHECK (pre_baseline_event_revisions = 'not_recorded'),
  CONSTRAINT history_checkpoints_event_sequence UNIQUE (event_id, sequence),
  CONSTRAINT history_checkpoints_event_digest UNIQUE (event_id, content_sha256)
);

CREATE TABLE history_checkpoint_members (
  checkpoint_id uuid NOT NULL REFERENCES history_checkpoints (id) ON DELETE RESTRICT,
  relation_name text NOT NULL
    CONSTRAINT history_checkpoint_members_relation CHECK (relation_name IN (
      'probability_observations', 'evidence', 'move_log_revisions', 'event_revisions'
    )),
  row_key text NOT NULL,
  inserting_xid xid8 NOT NULL,
  PRIMARY KEY (checkpoint_id, relation_name, row_key)
);

CREATE FUNCTION omen_guard_history_checkpoint() RETURNS trigger
LANGUAGE plpgsql AS $hist$
DECLARE
  visible record;
BEGIN
  -- pg_snapshot has no equality operator; its text form is xmin:xmax:xip-list.
  IF NEW.observed_snapshot::text IS DISTINCT FROM pg_current_snapshot()::text THEN
    RAISE EXCEPTION 'checkpoint snapshot must be the publishing transaction snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT digest_row.content_sha256, digest_row.member_count, digest_row.semantic_history
    INTO visible
    FROM omen_visible_history_digest(NEW.event_id) AS digest_row;

  IF visible.member_count IS NULL OR visible.member_count < 1 THEN
    RAISE EXCEPTION 'checkpoint requires visible history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.content_sha256 IS DISTINCT FROM visible.content_sha256
     OR NEW.member_count IS DISTINCT FROM visible.member_count
     OR NEW.semantic_history IS DISTINCT FROM visible.semantic_history THEN
    RAISE EXCEPTION 'checkpoint digest does not match visible history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM omen_history_coverage AS coverage
     WHERE coverage.semantic_event_fields_from = NEW.semantic_event_fields_from
       AND coverage.record_availability_realigned_at = NEW.record_availability_realigned_at
  ) OR NEW.pre_baseline_event_revisions IS DISTINCT FROM 'not_recorded' THEN
    RAISE EXCEPTION 'checkpoint coverage baseline does not match omen_history_coverage'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$hist$;

CREATE TRIGGER history_checkpoints_guard
  BEFORE INSERT ON history_checkpoints
  FOR EACH ROW EXECUTE FUNCTION omen_guard_history_checkpoint();

CREATE FUNCTION omen_reject_late_checkpoint_member() RETURNS trigger
LANGUAGE plpgsql AS $hist$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM history_checkpoints
     WHERE id = NEW.checkpoint_id
       AND xmin::text::xid8 = pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'checkpoint members are fixed when the checkpoint is published'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$hist$;

CREATE TRIGGER history_checkpoint_members_same_transaction
  BEFORE INSERT ON history_checkpoint_members
  FOR EACH ROW EXECUTE FUNCTION omen_reject_late_checkpoint_member();

CREATE FUNCTION omen_check_checkpoint_members() RETURNS trigger
LANGUAGE plpgsql AS $hist$
DECLARE
  visible_count integer;
  stored_count integer;
  mismatch integer;
BEGIN
  SELECT count(*)::integer INTO visible_count
    FROM omen_visible_history_members(NEW.event_id);
  SELECT count(*)::integer INTO stored_count
    FROM history_checkpoint_members
   WHERE checkpoint_id = NEW.id;

  IF visible_count IS DISTINCT FROM stored_count OR stored_count IS DISTINCT FROM NEW.member_count THEN
    RAISE EXCEPTION 'checkpoint % member count does not match visible history', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer INTO mismatch
    FROM (
      SELECT relation_name, row_key, inserting_xid::text
        FROM omen_visible_history_members(NEW.event_id)
      EXCEPT
      SELECT relation_name, row_key, inserting_xid::text
        FROM history_checkpoint_members
       WHERE checkpoint_id = NEW.id
    ) AS diff;

  IF mismatch <> 0 THEN
    RAISE EXCEPTION 'checkpoint % members do not match visible history', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$hist$;

CREATE CONSTRAINT TRIGGER history_checkpoints_members_match
  AFTER INSERT ON history_checkpoints
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION omen_check_checkpoint_members();

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

CREATE FUNCTION omen_publish_history_checkpoint(p_event_id text)
RETURNS TABLE (
  id uuid,
  sequence integer,
  created boolean,
  semantic_history text,
  content_sha256 text
)
LANGUAGE plpgsql AS $hist$
DECLARE
  v_sha text;
  v_count integer;
  v_semantic text;
  v_existing_id uuid;
  v_existing_seq integer;
  v_existing_semantic text;
  v_existing_sha text;
  v_seq integer;
  v_new_id uuid;
BEGIN
  IF current_setting('transaction_isolation') NOT IN ('repeatable read', 'serializable') THEN
    RAISE EXCEPTION 'history checkpoints must be published in a repeatable read transaction'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Serialise publishers without FOR UPDATE. An in-flight history insert holds
  -- FOR KEY SHARE on the event, and FOR UPDATE would wait for that commit.
  PERFORM pg_advisory_xact_lock(740618, hashtext(p_event_id));

  PERFORM 1 FROM events WHERE events.id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % does not exist', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A snapshot cannot claim rows this transaction has not committed.
  -- pg_visible_in_snapshot is false for the current xid, so publishing here
  -- would store the previous state and drop the new bundle.
  IF EXISTS (
    SELECT 1 FROM probability_observations
     WHERE event_id = p_event_id AND xmin::text::xid8 = pg_current_xact_id()
    UNION ALL
    SELECT 1 FROM evidence
     WHERE event_id = p_event_id AND xmin::text::xid8 = pg_current_xact_id()
    UNION ALL
    SELECT 1 FROM event_revisions
     WHERE event_id = p_event_id AND xmin::text::xid8 = pg_current_xact_id()
    UNION ALL
    SELECT 1 FROM move_log_revisions AS revision
      JOIN move_logs AS log ON log.id = revision.move_log_id
     WHERE log.event_id = p_event_id AND revision.xmin::text::xid8 = pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'cannot publish a checkpoint for event % in the transaction that wrote its history', p_event_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT digest_row.content_sha256, digest_row.member_count, digest_row.semantic_history
    INTO v_sha, v_count, v_semantic
    FROM omen_visible_history_digest(p_event_id) AS digest_row;

  IF coalesce(v_count, 0) < 1 THEN
    RAISE EXCEPTION 'event % has no visible history to checkpoint', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT checkpoint.id, checkpoint.sequence, checkpoint.semantic_history, checkpoint.content_sha256
    INTO v_existing_id, v_existing_seq, v_existing_semantic, v_existing_sha
    FROM history_checkpoints AS checkpoint
   WHERE checkpoint.event_id = p_event_id
     AND checkpoint.content_sha256 = v_sha
   ORDER BY checkpoint.sequence
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    id := v_existing_id;
    sequence := v_existing_seq;
    created := false;
    semantic_history := v_existing_semantic;
    content_sha256 := v_existing_sha;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(max(checkpoint.sequence), 0) + 1
    INTO v_seq
    FROM history_checkpoints AS checkpoint
   WHERE checkpoint.event_id = p_event_id;

  INSERT INTO history_checkpoints (
    event_id, sequence, observed_snapshot, content_sha256, member_count,
    semantic_history, semantic_event_fields_from, record_availability_realigned_at,
    pre_baseline_event_revisions
  )
  SELECT p_event_id, v_seq, pg_current_snapshot(), v_sha, v_count, v_semantic,
         coverage.semantic_event_fields_from, coverage.record_availability_realigned_at,
         'not_recorded'
    FROM omen_history_coverage AS coverage
  RETURNING history_checkpoints.id INTO v_new_id;

  INSERT INTO history_checkpoint_members (checkpoint_id, relation_name, row_key, inserting_xid)
  SELECT v_new_id, member.relation_name, member.row_key, member.inserting_xid
    FROM omen_visible_history_members(p_event_id) AS member;

  id := v_new_id;
  sequence := v_seq;
  created := true;
  semantic_history := v_semantic;
  content_sha256 := v_sha;
  RETURN NEXT;
  RETURN;
END;
$hist$;

CREATE FUNCTION omen_checkpoint_member_lines(p_checkpoint_id uuid)
RETURNS TABLE (relation_name text, row_key text, line text, visible boolean)
LANGUAGE sql STABLE AS $hist$
  SELECT member.relation_name, member.row_key, canon.line,
         pg_visible_in_snapshot(member.inserting_xid, checkpoint.observed_snapshot)
    FROM history_checkpoint_members AS member
    JOIN history_checkpoints AS checkpoint ON checkpoint.id = member.checkpoint_id
    LEFT JOIN LATERAL (
      SELECT omen_canonical_observation(
               observation.id, observation.event_id, observation.source_kind, observation.source_name,
               observation.probability_type, observation.probability_pct, observation.observed_at,
               observation.captured_at, observation.note, observation.provenance, observation.record_available_at
             ) AS line
        FROM probability_observations AS observation
       WHERE member.relation_name = 'probability_observations'
         AND observation.id = member.row_key::bigint
      UNION ALL
      SELECT omen_canonical_evidence(
               item.id, item.event_id, item.source_name, item.source_url, item.source_published_at,
               item.first_observed_at, item.captured_at, item.summary, item.stance, item.reliability,
               item.recorded_by, item.provenance, item.record_available_at
             )
        FROM evidence AS item
       WHERE member.relation_name = 'evidence'
         AND item.id = member.row_key
      UNION ALL
      SELECT omen_canonical_move_log_revision(
               revision.id, log.event_id, revision.move_log_id, revision.version, revision.published_at,
               revision.recorded_at, revision.author, revision.what_changed, revision.likely_cause,
               revision.explained_pct, revision.unexplained_factors, revision.evidence_ids,
               revision.correction_note, revision.provenance, revision.record_available_at
             )
        FROM move_log_revisions AS revision
        JOIN move_logs AS log ON log.id = revision.move_log_id
       WHERE member.relation_name = 'move_log_revisions'
         AND revision.id = member.row_key::bigint
      UNION ALL
      SELECT omen_canonical_event_revision(
               revision.id, revision.event_id, revision.version, revision.title, revision.question,
               revision.status, revision.deadline, revision.resolution_criteria, revision.category,
               revision.significance, revision.region, revision.summary, revision.tags,
               revision.related_event_ids, revision.provenance, revision.correction_note,
               revision.recorded_at, revision.record_available_at
             )
        FROM event_revisions AS revision
       WHERE member.relation_name = 'event_revisions'
         AND revision.id = member.row_key::bigint
    ) AS canon ON true
   WHERE member.checkpoint_id = p_checkpoint_id
$hist$;

CREATE FUNCTION omen_verify_history_checkpoint(p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $hist$
DECLARE
  cp history_checkpoints%ROWTYPE;
  stored_count integer;
  missing_count integer;
  invisible_count integer;
  recomputed_sha text;
  recomputed_count integer;
  recomputed_semantic text;
BEGIN
  SELECT * INTO cp FROM history_checkpoints WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF cp.pre_baseline_event_revisions IS DISTINCT FROM 'not_recorded'
     OR NOT EXISTS (
       SELECT 1
         FROM omen_history_coverage AS coverage
        WHERE coverage.semantic_event_fields_from = cp.semantic_event_fields_from
          AND coverage.record_availability_realigned_at = cp.record_availability_realigned_at
     ) THEN
    RETURN 'coverage-baseline-mismatch';
  END IF;

  SELECT count(*)::integer INTO stored_count
    FROM history_checkpoint_members
   WHERE checkpoint_id = p_id;
  IF stored_count IS DISTINCT FROM cp.member_count THEN
    RETURN 'member-count-mismatch';
  END IF;

  SELECT count(*)::integer INTO missing_count
    FROM omen_checkpoint_member_lines(p_id) AS member_line
   WHERE member_line.line IS NULL;
  IF missing_count > 0 THEN
    RETURN 'member-row-missing';
  END IF;

  SELECT count(*)::integer INTO invisible_count
    FROM omen_checkpoint_member_lines(p_id) AS member_line
   WHERE NOT member_line.visible;
  IF invisible_count > 0 THEN
    RETURN 'member-not-visible-in-snapshot';
  END IF;

  SELECT encode(
           public.digest(
             convert_to(coalesce(string_agg(member_line.line, chr(10) ORDER BY member_line.relation_name, member_line.row_key), ''), 'UTF8'),
             'sha256'
           ),
           'hex'
         ),
         count(*)::integer,
         CASE WHEN bool_or(member_line.relation_name = 'event_revisions') THEN 'recorded' ELSE 'unavailable' END
    INTO recomputed_sha, recomputed_count, recomputed_semantic
    FROM omen_checkpoint_member_lines(p_id) AS member_line;

  IF recomputed_count IS DISTINCT FROM cp.member_count THEN
    RETURN 'member-count-mismatch';
  END IF;
  IF recomputed_semantic IS DISTINCT FROM cp.semantic_history THEN
    RETURN 'semantic-history-mismatch';
  END IF;
  IF recomputed_sha IS DISTINCT FROM cp.content_sha256 THEN
    RETURN 'digest-mismatch';
  END IF;

  RETURN 'ok';
END;
$hist$;
