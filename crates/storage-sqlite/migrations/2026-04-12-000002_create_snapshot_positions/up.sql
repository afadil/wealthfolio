-- Create snapshot_positions table to replace the positions JSON blob in
-- holdings_snapshots.  Integer autoincrement PK; natural key is
-- (snapshot_id, asset_id).
CREATE TABLE snapshot_positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id     TEXT    NOT NULL REFERENCES holdings_snapshots(id) ON DELETE CASCADE,
    asset_id        TEXT    NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    quantity        TEXT    NOT NULL,
    average_cost    TEXT    NOT NULL,
    total_cost_basis TEXT   NOT NULL,
    currency        TEXT    NOT NULL,
    inception_date  TEXT    NOT NULL,
    is_alternative  INTEGER NOT NULL DEFAULT 0,
    contract_multiplier TEXT NOT NULL DEFAULT '1',
    created_at      TEXT    NOT NULL,
    last_updated    TEXT    NOT NULL,
    UNIQUE (snapshot_id, asset_id)
);

CREATE INDEX idx_snapshot_positions_snapshot_id ON snapshot_positions(snapshot_id);
CREATE INDEX idx_snapshot_positions_asset_id    ON snapshot_positions(asset_id);

-- Populate snapshot_positions from existing non-empty positions JSON.
-- Phase B already cleared Calculated snapshots to '{}', so this only
-- processes HOLDINGS-mode data (ManualEntry, BrokerImported, CsvImport,
-- Synthetic).
INSERT INTO snapshot_positions (
    snapshot_id, asset_id, quantity, average_cost, total_cost_basis,
    currency, inception_date, is_alternative, contract_multiplier,
    created_at, last_updated
)
SELECT
    hs.id,
    json_extract(pos.value, '$.assetId'),
    -- Numeric fields: json_extract returns float64 which can produce
    -- scientific notation (e.g. 1e-08).  Force decimal text via printf
    -- so that Decimal::from_str can parse them.
    rtrim(rtrim(printf('%.20f', json_extract(pos.value, '$.quantity')), '0'), '.'),
    rtrim(rtrim(printf('%.20f', json_extract(pos.value, '$.averageCost')), '0'), '.'),
    rtrim(rtrim(printf('%.20f', json_extract(pos.value, '$.totalCostBasis')), '0'), '.'),
    json_extract(pos.value, '$.currency'),
    COALESCE(json_extract(pos.value, '$.inceptionDate'), '1970-01-01T00:00:00Z'),
    COALESCE(json_extract(pos.value, '$.isAlternative'), 0),
    rtrim(rtrim(printf('%.20f', COALESCE(json_extract(pos.value, '$.contractMultiplier'), 1)), '0'), '.'),
    COALESCE(json_extract(pos.value, '$.createdAt'), '1970-01-01T00:00:00Z'),
    COALESCE(json_extract(pos.value, '$.lastUpdated'), '1970-01-01T00:00:00Z')
FROM holdings_snapshots hs,
     json_each(hs.positions) pos
WHERE hs.positions != '{}'
  AND hs.positions != ''
  AND json_extract(pos.value, '$.assetId') IS NOT NULL;

-- Clear the now-redundant JSON. All position data lives in
-- snapshot_positions; the Rust code always writes '{}' going forward.
UPDATE holdings_snapshots SET positions = '{}' WHERE positions != '{}';
