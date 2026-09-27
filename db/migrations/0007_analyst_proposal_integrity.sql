-- OMEN: analyst proposal input-context integrity.
-- Persist the event question and prompt version that formed the reviewed input
-- identity. Legacy rows leave these NULL and must not retain effective approval;
-- they require regeneration/review. Do not rewrite migration 0006.

ALTER TABLE analyst_proposals
  ADD COLUMN reviewed_event_question text
    CONSTRAINT analyst_proposals_reviewed_question_present CHECK (
      reviewed_event_question IS NULL OR char_length(btrim(reviewed_event_question)) > 0
    ),
  ADD COLUMN reviewed_prompt_version text
    CONSTRAINT analyst_proposals_reviewed_prompt_present CHECK (
      reviewed_prompt_version IS NULL OR char_length(btrim(reviewed_prompt_version)) > 0
    );

ALTER TABLE analyst_proposals
  ADD CONSTRAINT analyst_proposals_reviewed_context_pair CHECK (
    (reviewed_event_question IS NULL) = (reviewed_prompt_version IS NULL)
  );
