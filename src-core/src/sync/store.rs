use diesel::prelude::*;
use diesel::sql_types::{BigInt, Bool, Integer, Nullable, Text};
use diesel::{r2d2::ConnectionManager, sql_query, SqliteConnection};
use serde::{Deserialize, Serialize};

use crate::sync::types::{AccountSyncRow, ActivitySyncRow, AssetSyncRow};

pub type DbConn = SqliteConnection;
pub type DbPool = r2d2::Pool<ConnectionManager<DbConn>>;

// Ensure FK on
pub fn enable_pragmas(conn: &mut DbConn) -> anyhow::Result<()> {
    sql_query("PRAGMA foreign_keys = ON;").execute(conn)?;
    Ok(())
}

// Device id row in sync_device
pub fn ensure_device_id(conn: &mut DbConn, device_id: &str) -> anyhow::Result<()> {
    sql_query("INSERT OR REPLACE INTO sync_device(id) VALUES (?1)")
        .bind::<Text, _>(device_id)
        .execute(conn)?;
    Ok(())
}

// Compute a global max version across both tables
pub fn max_version(conn: &mut DbConn) -> anyhow::Result<i64> {
    #[derive(QueryableByName)]
    struct VRow {
        #[diesel(sql_type = Nullable<BigInt>)]
        v: Option<i64>,
    }
    let row: VRow = sql_query(
        "SELECT COALESCE(MAX(v), 0) AS v FROM (
           SELECT MAX(updated_version) AS v FROM accounts
           UNION ALL
           SELECT MAX(updated_version) AS v FROM activities
         )",
    )
    .get_result(conn)?;
    Ok(row.v.unwrap_or(0))
}

// Peer checkpoints
pub fn get_checkpoint(conn: &mut DbConn, peer_id: &str) -> anyhow::Result<i64> {
    #[derive(QueryableByName)]
    struct Row {
        #[diesel(sql_type = Nullable<BigInt>)]
        last_version_received: Option<i64>,
    }
    let row = sql_query(
        "SELECT last_version_received FROM peer_checkpoint WHERE peer_id = ?1",
    )
    .bind::<Text, _>(peer_id)
    .get_result::<Row>(conn)
    .optional()?;
    Ok(row.and_then(|r| r.last_version_received).unwrap_or(0))
}

pub fn set_checkpoint_received(conn: &mut DbConn, peer_id: &str, v: i64) -> anyhow::Result<()> {
    sql_query(
        "INSERT INTO peer_checkpoint(peer_id, last_version_received)
         VALUES (?1, ?2)
         ON CONFLICT(peer_id) DO UPDATE SET last_version_received = excluded.last_version_received",
    )
    .bind::<Text, _>(peer_id)
    .bind::<BigInt, _>(v)
    .execute(conn)?;
    Ok(())
}

pub fn set_checkpoint_sent(conn: &mut DbConn, peer_id: &str, v: i64) -> anyhow::Result<()> {
    sql_query(
        "INSERT INTO peer_checkpoint(peer_id, last_version_sent)
         VALUES (?1, ?2)
         ON CONFLICT(peer_id) DO UPDATE SET last_version_sent = excluded.last_version_sent",
    )
    .bind::<Text, _>(peer_id)
    .bind::<BigInt, _>(v)
    .execute(conn)?;
    Ok(())
}

// Outbound: accounts since
#[derive(QueryableByName, Serialize, Deserialize)]
struct AccountsQueryRow {
    #[diesel(sql_type = Text)] id: String,
    #[diesel(sql_type = Text)] name: String,
    #[diesel(sql_type = Text)] account_type: String,
    #[diesel(sql_type = Nullable<Text>)] group: Option<String>,
    #[diesel(sql_type = Text)] currency: String,
    #[diesel(sql_type = Bool)] is_default: bool,
    #[diesel(sql_type = Bool)] is_active: bool,
    #[diesel(sql_type = Text)] created_at: String,
    #[diesel(sql_type = Text)] updated_at: String,
    #[diesel(sql_type = Nullable<Text>)] platform_id: Option<String>,
    #[diesel(sql_type = BigInt)] updated_version: i64,
    #[diesel(sql_type = Text)] origin: String,
    #[diesel(sql_type = Integer)] deleted: i32,
}

impl From<AccountsQueryRow> for AccountSyncRow {
    fn from(r: AccountsQueryRow) -> Self {
        Self {
            id: r.id,
            name: r.name,
            account_type: r.account_type,
            group: r.group,
            currency: r.currency,
            is_default: r.is_default,
            is_active: r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
            platform_id: r.platform_id,
            updated_version: r.updated_version,
            origin: r.origin,
            deleted: r.deleted as i64,
        }
    }
}

pub fn get_accounts_since(conn: &mut DbConn, since: i64, limit: i64) -> anyhow::Result<Vec<AccountSyncRow>> {
    let rows = sql_query(
        r#"
        SELECT id, name, account_type, "group", currency,
               is_default, is_active, created_at, updated_at, platform_id,
               updated_version, origin, deleted
          FROM accounts
         WHERE updated_version > ?1
         ORDER BY updated_version ASC
         LIMIT ?2
        "#,
    )
    .bind::<BigInt, _>(since)
    .bind::<BigInt, _>(limit)
    .load::<AccountsQueryRow>(conn)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

// Outbound: activities since
#[derive(QueryableByName, Serialize, Deserialize)]
struct ActivitiesQueryRow {
    #[diesel(sql_type = Text)] id: String,
    #[diesel(sql_type = Text)] account_id: String,
    #[diesel(sql_type = Text)] asset_id: String,
    #[diesel(sql_type = Text)] activity_type: String,
    #[diesel(sql_type = Text)] activity_date: String,
    #[diesel(sql_type = Text)] quantity: String,
    #[diesel(sql_type = Text)] unit_price: String,
    #[diesel(sql_type = Text)] currency: String,
    #[diesel(sql_type = Text)] fee: String,
    #[diesel(sql_type = Bool)] is_draft: bool,
    #[diesel(sql_type = Nullable<Text>)] comment: Option<String>,
    #[diesel(sql_type = Text)] created_at: String,
    #[diesel(sql_type = Text)] updated_at: String,
    #[diesel(sql_type = BigInt)] updated_version: i64,
    #[diesel(sql_type = Text)] origin: String,
    #[diesel(sql_type = Integer)] deleted: i32,
}

impl From<ActivitiesQueryRow> for ActivitySyncRow {
    fn from(r: ActivitiesQueryRow) -> Self {
        Self {
            id: r.id,
            account_id: r.account_id,
            asset_id: r.asset_id,
            activity_type: r.activity_type,
            activity_date: r.activity_date,
            quantity: r.quantity,
            unit_price: r.unit_price,
            currency: r.currency,
            fee: r.fee,
            is_draft: r.is_draft,
            comment: r.comment,
            created_at: r.created_at,
            updated_at: r.updated_at,
            updated_version: r.updated_version,
            origin: r.origin,
            deleted: r.deleted as i64,
        }
    }
}

pub fn get_activities_since(conn: &mut DbConn, since: i64, limit: i64) -> anyhow::Result<Vec<ActivitySyncRow>> {
    let rows = sql_query(
        r#"
        SELECT id, account_id, asset_id, activity_type, activity_date,
               CAST(quantity AS TEXT) AS quantity,
               CAST(unit_price AS TEXT) AS unit_price,
               currency,
               CAST(fee AS TEXT) AS fee,
               is_draft, comment, created_at, updated_at,
               updated_version, origin, deleted
          FROM activities
         WHERE updated_version > ?1
         ORDER BY updated_version ASC
         LIMIT ?2
        "#,
    )
    .bind::<BigInt, _>(since)
    .bind::<BigInt, _>(limit)
    .load::<ActivitiesQueryRow>(conn)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

// Inbound: apply accounts (LWW)
pub fn apply_accounts(conn: &mut DbConn, rows: &[AccountSyncRow]) -> anyhow::Result<()> {
    conn.immediate_transaction(|c| {
        for r in rows {
            sql_query(
                r#"
                INSERT INTO accounts (
                    id, name, account_type, "group", currency,
                    is_default, is_active, created_at, updated_at, platform_id,
                    updated_version, origin, deleted
                )
                VALUES (?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9, ?10,
                        ?11, ?12, ?13)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    account_type = excluded.account_type,
                    "group" = excluded."group",
                    currency = excluded.currency,
                    is_default = excluded.is_default,
                    is_active = excluded.is_active,
                    updated_at = excluded.updated_at,
                    platform_id = excluded.platform_id,
                    updated_version = excluded.updated_version,
                    origin = excluded.origin,
                    deleted = excluded.deleted
                WHERE
                  excluded.updated_version > accounts.updated_version OR
                  (excluded.updated_version = accounts.updated_version AND excluded.origin > accounts.origin)
                "#
            )
            .bind::<Text, _>(&r.id)
            .bind::<Text, _>(&r.name)
            .bind::<Text, _>(&r.account_type)
            .bind::<Nullable<Text>, _>(&r.group)
            .bind::<Text, _>(&r.currency)
            .bind::<Bool, _>(r.is_default)
            .bind::<Bool, _>(r.is_active)
            .bind::<Text, _>(&r.created_at)
            .bind::<Text, _>(&r.updated_at)
            .bind::<Nullable<Text>, _>(&r.platform_id)
            .bind::<BigInt, _>(r.updated_version)
            .bind::<Text, _>(&r.origin)
            .bind::<Integer, _>(r.deleted as i32)
            .execute(c)?;
        }
        Ok::<(), anyhow::Error>(())
    })?;
    Ok(())
}

// Inbound: apply activities (LWW)
pub fn apply_activities(conn: &mut DbConn, rows: &[ActivitySyncRow]) -> anyhow::Result<()> {
    conn.immediate_transaction(|c| {
        for r in rows {
            sql_query(
                r#"
                INSERT INTO activities (
                    id, account_id, asset_id, activity_type, activity_date,
                    quantity, unit_price, currency, fee, is_draft,
                    comment, created_at, updated_at,
                    updated_version, origin, deleted
                )
                VALUES (?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9, ?10,
                        ?11, ?12, ?13,
                        ?14, ?15, ?16)
                ON CONFLICT(id) DO UPDATE SET
                    account_id      = excluded.account_id,
                    asset_id        = excluded.asset_id,
                    activity_type   = excluded.activity_type,
                    activity_date   = excluded.activity_date,
                    quantity        = excluded.quantity,
                    unit_price      = excluded.unit_price,
                    currency        = excluded.currency,
                    fee             = excluded.fee,
                    is_draft        = excluded.is_draft,
                    comment         = excluded.comment,
                    updated_at      = excluded.updated_at,
                    updated_version = excluded.updated_version,
                    origin          = excluded.origin,
                    deleted         = excluded.deleted
                WHERE
                  excluded.updated_version > activities.updated_version OR
                  (excluded.updated_version = activities.updated_version AND excluded.origin > activities.origin)
                "#
            )
            .bind::<Text, _>(&r.id)
            .bind::<Text, _>(&r.account_id)
            .bind::<Text, _>(&r.asset_id)
            .bind::<Text, _>(&r.activity_type)
            .bind::<Text, _>(&r.activity_date)
            .bind::<Text, _>(&r.quantity)
            .bind::<Text, _>(&r.unit_price)
            .bind::<Text, _>(&r.currency)
            .bind::<Text, _>(&r.fee)
            .bind::<Bool, _>(r.is_draft)
            .bind::<Nullable<Text>, _>(&r.comment)
            .bind::<Text, _>(&r.created_at)
            .bind::<Text, _>(&r.updated_at)
            .bind::<BigInt, _>(r.updated_version)
            .bind::<Text, _>(&r.origin)
            .bind::<Integer, _>(r.deleted as i32)
            .execute(c)?;
        }
        Ok::<(), anyhow::Error>(())
    })?;
    Ok(())
}

// Add to sync/store.rs

pub fn get_checkpoint_received(conn: &mut DbConn, peer_id: &str) -> anyhow::Result<i64> {
    #[derive(QueryableByName)]
    struct Row {
        #[diesel(sql_type = Nullable<BigInt>)]
        last_version_received: Option<i64>,
    }
    let row = sql_query(
        "SELECT last_version_received FROM peer_checkpoint WHERE peer_id = ?1",
    )
    .bind::<Text, _>(peer_id)
    .get_result::<Row>(conn)
    .optional()?;
    Ok(row.and_then(|r| r.last_version_received).unwrap_or(0))
}

pub fn get_checkpoint_sent(conn: &mut DbConn, peer_id: &str) -> anyhow::Result<i64> {
    #[derive(QueryableByName)]
    struct Row {
        #[diesel(sql_type = Nullable<BigInt>)]
        last_version_sent: Option<i64>,
    }
    let row = sql_query(
        "SELECT last_version_sent FROM peer_checkpoint WHERE peer_id = ?1",
    )
    .bind::<Text, _>(peer_id)
    .get_result::<Row>(conn)
    .optional()?;
    Ok(row.and_then(|r| r.last_version_sent).unwrap_or(0))
}


/* checkpoints helpers (same as before) */
#[derive(QueryableByName)]
struct CheckRow { #[diesel(sql_type = Nullable<BigInt>)] v: Option<i64> }


/* Outbound: assets since */
#[derive(QueryableByName)]
struct AssetsQueryRow {
    #[diesel(sql_type = Text)] id: String,
    #[diesel(sql_type = Nullable<Text>)] isin: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] name: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] asset_type: Option<String>,
    #[diesel(sql_type = Text)] symbol: String,
    #[diesel(sql_type = Nullable<Text>)] symbol_mapping: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] asset_class: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] asset_sub_class: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] comment: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] countries: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] categories: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] classes: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] attributes: Option<String>,
    #[diesel(sql_type = Text)] created_at: String,
    #[diesel(sql_type = Text)] updated_at: String,
    #[diesel(sql_type = Text)] currency: String,
    #[diesel(sql_type = Text)] data_source: String,
    #[diesel(sql_type = Nullable<Text>)] sectors: Option<String>,
    #[diesel(sql_type = Nullable<Text>)] url: Option<String>,
    #[diesel(sql_type = BigInt)] updated_version: i64,
    #[diesel(sql_type = Text)] origin: String,
    #[diesel(sql_type = Integer)] deleted: i32,
}
impl From<AssetsQueryRow> for AssetSyncRow {
    fn from(r: AssetsQueryRow) -> Self {
        Self {
            id: r.id, isin: r.isin, name: r.name, asset_type: r.asset_type,
            symbol: r.symbol, symbol_mapping: r.symbol_mapping,
            asset_class: r.asset_class, asset_sub_class: r.asset_sub_class,
            comment: r.comment, countries: r.countries, categories: r.categories,
            classes: r.classes, attributes: r.attributes,
            created_at: r.created_at, updated_at: r.updated_at,
            currency: r.currency, data_source: r.data_source,
            sectors: r.sectors, url: r.url,
            updated_version: r.updated_version, origin: r.origin, deleted: r.deleted as i64
        }
    }
}
pub fn get_assets_since(conn: &mut DbConn, since: i64, limit: i64) -> anyhow::Result<Vec<AssetSyncRow>> {
    let rows = sql_query(
        r#"
        SELECT id, isin, name, asset_type, symbol, symbol_mapping,
               asset_class, asset_sub_class, comment, countries, categories, classes, attributes,
               created_at, updated_at, currency, data_source, sectors, url,
               updated_version, origin, deleted
          FROM assets
         WHERE updated_version > ?1
         ORDER BY updated_version ASC
         LIMIT ?2
        "#,
    )
    .bind::<BigInt,_>(since)
    .bind::<BigInt,_>(limit)
    .load::<AssetsQueryRow>(conn)?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/* Inbound: apply assets LWW */
pub fn apply_assets(conn: &mut DbConn, rows: &[AssetSyncRow]) -> anyhow::Result<()> {
    conn.immediate_transaction(|c| {
        for r in rows {
            sql_query(
                r#"
                INSERT INTO assets (
                    id, isin, name, asset_type, symbol, symbol_mapping,
                    asset_class, asset_sub_class, comment, countries, categories, classes, attributes,
                    created_at, updated_at, currency, data_source, sectors, url,
                    updated_version, origin, deleted
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                        ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                        ?14, ?15, ?16, ?17, ?18, ?19,
                        ?20, ?21, ?22)
                ON CONFLICT(id) DO UPDATE SET
                    isin           = excluded.isin,
                    name           = excluded.name,
                    asset_type     = excluded.asset_type,
                    symbol         = excluded.symbol,
                    symbol_mapping = excluded.symbol_mapping,
                    asset_class    = excluded.asset_class,
                    asset_sub_class= excluded.asset_sub_class,
                    comment        = excluded.comment,
                    countries      = excluded.countries,
                    categories     = excluded.categories,
                    classes        = excluded.classes,
                    attributes     = excluded.attributes,
                    updated_at     = excluded.updated_at,
                    currency       = excluded.currency,
                    data_source    = excluded.data_source,
                    sectors        = excluded.sectors,
                    url            = excluded.url,
                    updated_version= excluded.updated_version,
                    origin         = excluded.origin,
                    deleted        = excluded.deleted
                WHERE
                  excluded.updated_version > assets.updated_version OR
                  (excluded.updated_version = assets.updated_version AND excluded.origin > assets.origin)
                "#
            )
            .bind::<Text,_>(&r.id)
            .bind::<Nullable<Text>,_>(&r.isin)
            .bind::<Nullable<Text>,_>(&r.name)
            .bind::<Nullable<Text>,_>(&r.asset_type)
            .bind::<Text,_>(&r.symbol)
            .bind::<Nullable<Text>,_>(&r.symbol_mapping)
            .bind::<Nullable<Text>,_>(&r.asset_class)
            .bind::<Nullable<Text>,_>(&r.asset_sub_class)
            .bind::<Nullable<Text>,_>(&r.comment)
            .bind::<Nullable<Text>,_>(&r.countries)
            .bind::<Nullable<Text>,_>(&r.categories)
            .bind::<Nullable<Text>,_>(&r.classes)
            .bind::<Nullable<Text>,_>(&r.attributes)
            .bind::<Text,_>(&r.created_at)
            .bind::<Text,_>(&r.updated_at)
            .bind::<Text,_>(&r.currency)
            .bind::<Text,_>(&r.data_source)
            .bind::<Nullable<Text>,_>(&r.sectors)
            .bind::<Nullable<Text>,_>(&r.url)
            .bind::<BigInt,_>(r.updated_version)
            .bind::<Text,_>(&r.origin)
            .bind::<Integer,_>(r.deleted as i32)
            .execute(c)?;
        }
        Ok::<(), anyhow::Error>(())
    })?;
    Ok(())
}
