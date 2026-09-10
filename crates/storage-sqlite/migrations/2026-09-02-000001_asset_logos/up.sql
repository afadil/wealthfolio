-- Custom per-asset logo override. One row per asset; bytes stored as base64 so
-- the row travels through device sync (no blob channel) and DB-only backups.
CREATE TABLE asset_logos (
    asset_id   TEXT NOT NULL PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    mime_type  TEXT NOT NULL,
    data       TEXT NOT NULL,
    sha256     TEXT NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
