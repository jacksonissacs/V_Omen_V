-- A bundle review is staged before writeEventBundle creates the event.
-- source_review_items.event_id referenced events, so intake stage failed
-- while the book was empty. publication_operations already has no foreign key
-- for the same ordering reason.
-- The event id stays required and keeps the event id format.
-- Evidence, Move Log, and source-capture candidates still require a stored
-- event. That gate is in the staging code, not this foreign key.

ALTER TABLE source_review_items
  DROP CONSTRAINT source_review_items_event_id_fkey;

ALTER TABLE source_review_items
  ADD CONSTRAINT source_review_items_event_id_format CHECK (
    event_id ~ '^[a-z0-9][a-z0-9-]{2,79}$'
  );
