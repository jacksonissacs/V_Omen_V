-- OMEN V0: private operator publishing (review queue + durable publication operations).
--
-- Move log explained_pct may be omitted when no defensible share is recorded.

ALTER TABLE move_log_revisions
  ALTER COLUMN explained_pct DROP NOT NULL;

ALTER TABLE move_log_revisions
  DROP CONSTRAINT move_log_revisions_explained_scale;

ALTER TABLE move_log_revisions
  ADD CONSTRAINT move_log_revisions_explained_scale CHECK (
    explained_pct IS NULL OR (explained_pct BETWEEN 0 AND 100)
  );

CREATE TABLE source_review_items (
  id text PRIMARY KEY
    CONSTRAINT source_review_items_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  status text NOT NULL
    CONSTRAINT source_review_items_status_known CHECK (status IN ('staged', 'approved', 'rejected')),
  payload jsonb NOT NULL
    CONSTRAINT source_review_items_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  intake_note text,
  staged_at timestamptz NOT NULL DEFAULT now(),
  staged_by text NOT NULL
    CONSTRAINT source_review_items_staged_by_present CHECK (char_length(btrim(staged_by)) > 0),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  CONSTRAINT source_review_items_review_fields CHECK (
    (status = 'staged' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (
      status IN ('approved', 'rejected')
      AND reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND char_length(btrim(reviewed_by)) > 0
    )
  )
);

CREATE INDEX source_review_items_event_status ON source_review_items (event_id, status);

CREATE TABLE publication_operations (
  id text PRIMARY KEY
    CONSTRAINT publication_operations_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  idempotency_key text NOT NULL UNIQUE
    CONSTRAINT publication_operations_idempotency_present CHECK (char_length(btrim(idempotency_key)) > 0),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  status text NOT NULL
    CONSTRAINT publication_operations_status_known CHECK (
      status IN ('pending', 'checkpoint_pending', 'completed', 'failed')
    ),
  bundle jsonb NOT NULL
    CONSTRAINT publication_operations_bundle_object CHECK (jsonb_typeof(bundle) = 'object'),
  write_summary jsonb,
  checkpoint_id bigint,
  checkpoint_sequence integer,
  source_review_item_id text REFERENCES source_review_items (id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX publication_operations_event ON publication_operations (event_id, created_at DESC);

CREATE FUNCTION omen_touch_publication_operation_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER publication_operations_touch_updated_at
  BEFORE UPDATE ON publication_operations
  FOR EACH ROW EXECUTE FUNCTION omen_touch_publication_operation_updated_at();
