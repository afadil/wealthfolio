-- Security positions are now tracked in the `lots` table.
-- Clear the serialized JSON from holdings_snapshots to reclaim space.
-- The positions column remains in the schema for backward compatibility
-- but is written as '{}' by the application.
UPDATE holdings_snapshots SET positions = '{}';
