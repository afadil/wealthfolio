-- A1: Create materialized lots table.
--
-- Lots are the persistent, relational form of tax lots. Each row represents
-- a specific acquisition of an asset with its own cost basis and disposal
-- tracking. This decouples "what do I hold?" (lots, updated on activity
-- changes) from "what is it worth?" (quotes × lots, computed on read).
--
-- Initially empty. The holdings calculator will begin shadow-writing lot rows
-- alongside existing JSON snapshots in a subsequent step (A2).

CREATE TABLE lots (
    id                  TEXT    PRIMARY KEY NOT NULL,
    account_id          TEXT    NOT NULL,
    asset_id            TEXT    NOT NULL,

    -- When the lot was opened and which activity opened it.
    -- open_activity_id is NULL for lots created from HOLDINGS-mode snapshots.
    open_date           TEXT    NOT NULL,
    open_activity_id    TEXT,

    -- Quantities stored as Decimal-serialized TEXT to preserve precision.
    original_quantity   TEXT    NOT NULL,
    remaining_quantity  TEXT    NOT NULL,

    -- Cost basis in the asset's quote currency (quote_ccy on the assets row).
    cost_per_unit       TEXT    NOT NULL,
    total_cost_basis    TEXT    NOT NULL,
    fee_allocated       TEXT    NOT NULL DEFAULT '0',

    -- Disposal tracking.
    disposal_method     TEXT    NOT NULL DEFAULT 'FIFO',
    is_closed           INTEGER NOT NULL DEFAULT 0,

    -- Populated when the lot is fully disposed.
    close_date          TEXT,
    close_activity_id   TEXT,

    -- Tax-relevant flags (populated during shadow-write / future tax phase).
    is_wash_sale        INTEGER NOT NULL DEFAULT 0,
    holding_period      TEXT,   -- SHORT_TERM | LONG_TERM | NULL (still open)

    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CHECK (disposal_method IN ('FIFO', 'LIFO', 'SPECIFIC_ID', 'AVG_COST', 'HIFO')),
    CHECK (is_closed   IN (0, 1)),
    CHECK (is_wash_sale IN (0, 1)),
    CHECK (holding_period IS NULL OR holding_period IN ('SHORT_TERM', 'LONG_TERM')),

    FOREIGN KEY (account_id)        REFERENCES accounts(id)    ON DELETE CASCADE,
    FOREIGN KEY (asset_id)          REFERENCES assets(id)      ON DELETE CASCADE,
    FOREIGN KEY (open_activity_id)  REFERENCES activities(id)  ON DELETE SET NULL,
    FOREIGN KEY (close_activity_id) REFERENCES activities(id)  ON DELETE SET NULL
);

-- Hot-path query: valuation = lots JOIN quotes WHERE is_closed = 0
CREATE INDEX idx_lots_account_asset ON lots(account_id, asset_id);
-- Query open lots for an asset across all accounts (e.g. "show me all AAPL lots")
CREATE INDEX idx_lots_asset_open    ON lots(asset_id, is_closed, open_date);
-- Query all open lots for an account (e.g. incremental valuation update)
CREATE INDEX idx_lots_account_open  ON lots(account_id, is_closed);
-- Reverse-lookup: which lot was opened by this activity?
CREATE INDEX idx_lots_open_activity ON lots(open_activity_id)
    WHERE open_activity_id IS NOT NULL;
