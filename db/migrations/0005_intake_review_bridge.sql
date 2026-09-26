-- Links one captured source version to one database review item.
-- Importing stages that item. It does not approve or publish it.
-- source_published_date is a calendar date. It is never a substitute for source_published_at.

ALTER TABLE source_review_items
  ADD COLUMN intake_source_id text,
  ADD COLUMN intake_item_id text,
  ADD COLUMN captured_version integer,
  ADD COLUMN content_identity text,
  ADD COLUMN canonical_url text,
  ADD COLUMN source_published_at timestamptz,
  ADD COLUMN source_published_date date,
  ADD COLUMN first_fetched_at timestamptz,
  ADD COLUMN review_stance text,
  ADD COLUMN review_reliability numeric(3, 2);

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_intake_pair CHECK (
    (
      intake_source_id IS NULL
      AND intake_item_id IS NULL
      AND captured_version IS NULL
      AND content_identity IS NULL
      AND canonical_url IS NULL
      AND first_fetched_at IS NULL
    )
    OR (
      intake_source_id ~ '^[a-z0-9][a-z0-9-]{2,79}$'
      AND char_length(btrim(intake_item_id)) > 0
      AND captured_version >= 1
      AND content_identity ~ '^[0-9a-f]{64}$'
      AND canonical_url ~ '^https://'
      AND first_fetched_at IS NOT NULL
    )
  );

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_intake_version_unique
  UNIQUE (intake_source_id, intake_item_id, captured_version);

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_review_stance CHECK (
    review_stance IS NULL OR review_stance IN ('supports', 'contradicts', 'contextual')
  );

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_review_reliability CHECK (
    review_reliability IS NULL OR (review_reliability BETWEEN 0 AND 1)
  );

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_capture_completion CHECK (
    status <> 'approved'
    OR COALESCE(payload->>'kind', '') <> 'source_capture'
    OR (review_stance IS NOT NULL AND review_reliability IS NOT NULL)
  );
