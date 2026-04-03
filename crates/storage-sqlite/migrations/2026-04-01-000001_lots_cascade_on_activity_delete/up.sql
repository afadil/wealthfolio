-- Change lots FK on open_activity_id from SET NULL to CASCADE.
-- When an activity is deleted, its lots should be removed immediately
-- rather than orphaned with a NULL activity reference.
--
-- SQLite doesn't support ALTER FOREIGN KEY, so we rebuild the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE lots_new (
    id                  TEXT    PRIMARY KEY NOT NULL,
    account_id          TEXT    NOT NULL,
    asset_id            TEXT    NOT NULL,

    open_date           TEXT    NOT NULL,
    open_activity_id    TEXT,

    original_quantity   TEXT    NOT NULL,
    remaining_quantity  TEXT    NOT NULL,

    cost_per_unit       TEXT    NOT NULL,
    total_cost_basis    TEXT    NOT NULL,
    fee_allocated       TEXT    NOT NULL DEFAULT '0',

    disposal_method     TEXT    NOT NULL DEFAULT 'FIFO',
    is_closed           INTEGER NOT NULL DEFAULT 0,

    close_date          TEXT,
    close_activity_id   TEXT,

    is_wash_sale        INTEGER NOT NULL DEFAULT 0,
    holding_period      TEXT,

    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK (disposal_method IN ('FIFO', 'LIFO', 'SPECIFIC_ID', 'AVG_COST', 'HIFO')),
    CHECK (is_closed   IN (0, 1)),
    CHECK (is_wash_sale IN (0, 1)),
    CHECK (holding_period IS NULL OR holding_period IN ('SHORT_TERM', 'LONG_TERM')),

    FOREIGN KEY (account_id)        REFERENCES accounts(id)    ON DELETE CASCADE,
    FOREIGN KEY (asset_id)          REFERENCES assets(id)      ON DELETE CASCADE,
    FOREIGN KEY (open_activity_id)  REFERENCES activities(id)  ON DELETE CASCADE,
    FOREIGN KEY (close_activity_id) REFERENCES activities(id)  ON DELETE SET NULL
);

-- Copy existing data, dropping orphaned lots (NULL open_activity_id with
-- no matching activity) in the process.
INSERT INTO lots_new
SELECT l.*
FROM lots l
WHERE l.open_activity_id IS NULL
   OR l.open_activity_id IN (SELECT id FROM activities);

DROP TABLE lots;
ALTER TABLE lots_new RENAME TO lots;

-- Recreate indexes
CREATE INDEX idx_lots_account_asset ON lots(account_id, asset_id);
CREATE INDEX idx_lots_asset_open    ON lots(asset_id, is_closed, open_date);
CREATE INDEX idx_lots_account_open  ON lots(account_id, is_closed);
CREATE INDEX idx_lots_open_activity ON lots(open_activity_id)
    WHERE open_activity_id IS NOT NULL;

PRAGMA foreign_keys = ON;
