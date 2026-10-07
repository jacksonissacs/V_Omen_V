-- A publication operation is reserved before writeEventBundle commits the event.
-- The foreign key made that reservation fail for a new event. history_checkpoints
-- already has no foreign key to events for a related ordering reason.
-- The event id stays required and keeps the event id format. Review items
-- still reference an event that already exists.

ALTER TABLE publication_operations
  DROP CONSTRAINT publication_operations_event_id_fkey;

ALTER TABLE publication_operations
  ADD CONSTRAINT publication_operations_event_id_format CHECK (
    event_id ~ '^[a-z0-9][a-z0-9-]{2,79}$'
  );
