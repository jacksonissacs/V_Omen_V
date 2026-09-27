-- OMEN: bounded AI analyst proposal runs and human-review staging.
-- Proposals are distinct from published evidence and Move Logs.
-- Membership validation of citations does not prove a source supports a claim.

CREATE TABLE analyst_runs (
  id text PRIMARY KEY
    CONSTRAINT analyst_runs_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  status text NOT NULL
    CONSTRAINT analyst_runs_status_known CHECK (
      status IN ('pending', 'succeeded', 'failed', 'unavailable', 'rejected_output')
    ),
  provider_id text NOT NULL
    CONSTRAINT analyst_runs_provider_present CHECK (char_length(btrim(provider_id)) > 0),
  model_id text NOT NULL
    CONSTRAINT analyst_runs_model_present CHECK (char_length(btrim(model_id)) > 0),
  -- synthetic = test/deterministic adapter; live = real provider (activation gated).
  -- A synthetic run must never be reported as a successful live-model evaluation.
  execution_kind text NOT NULL
    CONSTRAINT analyst_runs_execution_kind_known CHECK (execution_kind IN ('synthetic', 'live')),
  prompt_version text NOT NULL
    CONSTRAINT analyst_runs_prompt_present CHECK (char_length(btrim(prompt_version)) > 0),
  input_evidence jsonb NOT NULL
    CONSTRAINT analyst_runs_input_evidence_array CHECK (jsonb_typeof(input_evidence) = 'array'),
  input_content_identity text NOT NULL
    CONSTRAINT analyst_runs_input_identity_sha256 CHECK (input_content_identity ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer
    CONSTRAINT analyst_runs_duration_nonneg CHECK (duration_ms IS NULL OR duration_ms >= 0),
  -- Usage/cost stay null when unknown. Never store secrets here.
  usage jsonb
    CONSTRAINT analyst_runs_usage_object CHECK (usage IS NULL OR jsonb_typeof(usage) = 'object'),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analyst_runs_finished_fields CHECK (
    (status = 'pending' AND finished_at IS NULL AND duration_ms IS NULL)
    OR (status <> 'pending' AND finished_at IS NOT NULL)
  )
);

CREATE INDEX analyst_runs_event_created ON analyst_runs (event_id, created_at DESC);

CREATE TABLE analyst_proposals (
  id text PRIMARY KEY
    CONSTRAINT analyst_proposals_id_format CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  run_id text NOT NULL REFERENCES analyst_runs (id) ON DELETE RESTRICT,
  event_id text NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
  proposal_version integer NOT NULL DEFAULT 1
    CONSTRAINT analyst_proposals_version_positive CHECK (proposal_version >= 1),
  content_identity text NOT NULL
    CONSTRAINT analyst_proposals_content_sha256 CHECK (content_identity ~ '^[a-f0-9]{64}$'),
  input_content_identity text NOT NULL
    CONSTRAINT analyst_proposals_input_sha256 CHECK (input_content_identity ~ '^[a-f0-9]{64}$'),
  status text NOT NULL
    CONSTRAINT analyst_proposals_status_known CHECK (
      status IN ('draft', 'staged', 'rejected', 'superseded')
    ),
  proposal jsonb NOT NULL
    CONSTRAINT analyst_proposals_proposal_object CHECK (jsonb_typeof(proposal) = 'object'),
  staged_at timestamptz,
  staged_by text,
  source_review_item_id text REFERENCES source_review_items (id) ON DELETE SET NULL,
  -- Human review of the proposal draft (not Move Log publication).
  -- Approval binds to this proposal's content_identity + input_content_identity.
  approved_at timestamptz,
  approved_by text,
  approval_content_identity text
    CONSTRAINT analyst_proposals_approval_content_sha256 CHECK (
      approval_content_identity IS NULL OR approval_content_identity ~ '^[a-f0-9]{64}$'
    ),
  approval_input_identity text
    CONSTRAINT analyst_proposals_approval_input_sha256 CHECK (
      approval_input_identity IS NULL OR approval_input_identity ~ '^[a-f0-9]{64}$'
    ),
  rejected_at timestamptz,
  rejected_by text,
  reject_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analyst_proposals_stage_fields CHECK (
    (staged_at IS NULL) = (staged_by IS NULL)
    AND (
      status <> 'staged'
      OR (
        staged_at IS NOT NULL
        AND staged_by IS NOT NULL
        AND char_length(btrim(staged_by)) > 0
      )
    )
  ),
  CONSTRAINT analyst_proposals_approval_fields CHECK (
    (approved_at IS NULL AND approved_by IS NULL AND approval_content_identity IS NULL AND approval_input_identity IS NULL)
    OR (
      approved_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND char_length(btrim(approved_by)) > 0
      AND approval_content_identity IS NOT NULL
      AND approval_input_identity IS NOT NULL
    )
  ),
  CONSTRAINT analyst_proposals_reject_fields CHECK (
    (status <> 'rejected' AND rejected_at IS NULL AND rejected_by IS NULL)
    OR (
      status = 'rejected'
      AND rejected_at IS NOT NULL
      AND rejected_by IS NOT NULL
      AND char_length(btrim(rejected_by)) > 0
    )
  )
);

-- Identical proposal content for the same inputs stages at most once.
CREATE UNIQUE INDEX analyst_proposals_dedupe
  ON analyst_proposals (event_id, input_content_identity, content_identity);

CREATE INDEX analyst_proposals_event_status ON analyst_proposals (event_id, status);
CREATE INDEX analyst_proposals_run ON analyst_proposals (run_id);
