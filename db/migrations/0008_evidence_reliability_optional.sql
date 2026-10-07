-- Evidence may be stored when the recorder has no reliability rating.
-- NULL means no rating was recorded. It is not a score.
-- Do not rewrite migration 0001. A source-capture review may still
-- require an explicit rating at approval; that path is unchanged.

ALTER TABLE evidence
  ALTER COLUMN reliability DROP NOT NULL;

ALTER TABLE evidence
  DROP CONSTRAINT evidence_reliability_scale;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_reliability_scale CHECK (
    reliability IS NULL OR reliability BETWEEN 0 AND 1
  );
