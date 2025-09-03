// peer_store.rs - Persistent peer storage
use diesel::{prelude::*, sql_query};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::sync::store::DbConn;
use super::engine::Peer;

/// Save a peer to the database using individual parameters (for use in transport.rs to avoid circular imports)
pub fn save_connecting_peer(
    conn: &mut DbConn, 
    device_id: &Uuid, 
    name: &str
) -> anyhow::Result<()> {
    let now = Utc::now();
    sql_query(
        "INSERT INTO sync_peers (id, name, address, fingerprint, paired, trusted, is_master, last_seen, last_sync, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           paired = excluded.paired,
           last_seen = excluded.last_seen"
    )
    .bind::<diesel::sql_types::Text, _>(device_id.to_string())
    .bind::<diesel::sql_types::Text, _>(name)
    .bind::<diesel::sql_types::Text, _>("unknown") // address - we don't have it in transport context
    .bind::<diesel::sql_types::Text, _>("") // fingerprint - empty for now
    .bind::<diesel::sql_types::Bool, _>(true) // paired - true since they're connecting
    .bind::<diesel::sql_types::Bool, _>(false) // trusted - false by default
    .bind::<diesel::sql_types::Bool, _>(false) // is_master - false for client peers
    .bind::<diesel::sql_types::Text, _>(now.to_rfc3339()) // last_seen
    .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(None::<String>) // last_sync - None initially
    .bind::<diesel::sql_types::Text, _>(now.to_rfc3339()) // created_at
    .execute(conn)?;
    Ok(())
}

/// Save a master peer to the database (when client connects to master)
pub fn save_master_peer(
    conn: &mut DbConn, 
    device_id: &Uuid, 
    name: &str,
    address: &str
) -> anyhow::Result<()> {
    let now = Utc::now();
    sql_query(
        "INSERT INTO sync_peers (id, name, address, fingerprint, paired, trusted, is_master, last_seen, last_sync, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           paired = excluded.paired,
           is_master = excluded.is_master,
           last_seen = excluded.last_seen"
    )
    .bind::<diesel::sql_types::Text, _>(device_id.to_string())
    .bind::<diesel::sql_types::Text, _>(name)
    .bind::<diesel::sql_types::Text, _>(address) // actual address of the master
    .bind::<diesel::sql_types::Text, _>("") // fingerprint - empty for now
    .bind::<diesel::sql_types::Bool, _>(true) // paired - true since we're connecting
    .bind::<diesel::sql_types::Bool, _>(false) // trusted - false by default
    .bind::<diesel::sql_types::Bool, _>(true) // is_master - true for master peers
    .bind::<diesel::sql_types::Text, _>(now.to_rfc3339()) // last_seen
    .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(None::<String>) // last_sync - None initially
    .bind::<diesel::sql_types::Text, _>(now.to_rfc3339()) // created_at
    .execute(conn)?;
    Ok(())
}

/// Save a peer to the database for persistence
pub fn save_peer(conn: &mut DbConn, peer: &Peer) -> anyhow::Result<()> {
    sql_query(
        "INSERT INTO sync_peers (id, name, address, fingerprint, paired, trusted, is_master, last_seen, last_sync, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           fingerprint = excluded.fingerprint,
           paired = excluded.paired,
           last_seen = excluded.last_seen,
           last_sync = excluded.last_sync"
    )
    .bind::<diesel::sql_types::Text, _>(peer.id.to_string())
    .bind::<diesel::sql_types::Text, _>(&peer.name)
    .bind::<diesel::sql_types::Text, _>(&peer.address)
    .bind::<diesel::sql_types::Text, _>(&peer.fingerprint)
    .bind::<diesel::sql_types::Bool, _>(peer.paired)
    .bind::<diesel::sql_types::Bool, _>(false) // trusted flag, default to false
    .bind::<diesel::sql_types::Bool, _>(false) // is_master flag, default to false for client peers
    .bind::<diesel::sql_types::Text, _>(peer.last_seen.to_rfc3339())
    .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(
        peer.last_sync.as_ref().map(|d| d.to_rfc3339())
    )
    .bind::<diesel::sql_types::Text, _>(Utc::now().to_rfc3339())
    .execute(conn)?;
    Ok(())
}

/// Load all saved peers from the database
pub fn load_peers(conn: &mut DbConn) -> anyhow::Result<Vec<Peer>> {
    #[derive(QueryableByName)]
    struct PeerRow {
        #[diesel(sql_type = diesel::sql_types::Text)]
        id: String,
        #[diesel(sql_type = diesel::sql_types::Text)]
        name: String,
        #[diesel(sql_type = diesel::sql_types::Text)]
        address: String,
        #[diesel(sql_type = diesel::sql_types::Text)]
        fingerprint: String,
        #[diesel(sql_type = diesel::sql_types::Bool)]
        paired: bool,
        #[diesel(sql_type = diesel::sql_types::Text)]
        last_seen: String,
        #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
        last_sync: Option<String>,
    }

    let rows: Vec<PeerRow> = sql_query(
        "SELECT id, name, address, fingerprint, paired, last_seen, last_sync 
         FROM sync_peers 
         WHERE paired = 1
         ORDER BY last_seen DESC"
    )
    .load(conn)?;

    let mut peers = Vec::new();
    for row in rows {
        let peer = Peer {
            id: Uuid::parse_str(&row.id)?,
            name: row.name,
            address: row.address,
            fingerprint: row.fingerprint,
            paired: row.paired,
            last_seen: DateTime::parse_from_rfc3339(&row.last_seen)?.with_timezone(&Utc),
            last_sync: row.last_sync
                .map(|s| DateTime::parse_from_rfc3339(&s))
                .transpose()?
                .map(|dt| dt.with_timezone(&Utc)),
        };
        peers.push(peer);
    }

    Ok(peers)
}

/// Remove a peer from the database
pub fn remove_peer(conn: &mut DbConn, peer_id: &Uuid) -> anyhow::Result<()> {
    sql_query("DELETE FROM sync_peers WHERE id = ?1")
        .bind::<diesel::sql_types::Text, _>(peer_id.to_string())
        .execute(conn)?;
    Ok(())
}

/// Update peer's last_sync timestamp
pub fn update_peer_last_sync(conn: &mut DbConn, peer_id: &Uuid, last_sync: DateTime<Utc>) -> anyhow::Result<()> {
    sql_query("UPDATE sync_peers SET last_sync = ?1 WHERE id = ?2")
        .bind::<diesel::sql_types::Text, _>(last_sync.to_rfc3339())
        .bind::<diesel::sql_types::Text, _>(peer_id.to_string())
        .execute(conn)?;
    Ok(())
}

/// Set this device as master
pub fn set_as_master(conn: &mut DbConn, device_name: &str) -> anyhow::Result<()> {
    // First ensure the self entry exists
    sql_query(
        "INSERT INTO sync_peers (id, name, address, paired, trusted, is_master, last_seen, created_at)
         VALUES ('self', ?1, 'localhost:33445', true, true, false, ?2, ?2)
         ON CONFLICT(id) DO NOTHING"
    )
    .bind::<diesel::sql_types::Text, _>(device_name)
    .bind::<diesel::sql_types::Text, _>(Utc::now().to_rfc3339())
    .execute(conn)?;
    
    // Then set as master
    sql_query("UPDATE sync_peers SET is_master = true WHERE id = 'self'")
        .execute(conn)?;
    
    Ok(())
}

/// Remove master status from this device
pub fn remove_master_status(conn: &mut DbConn) -> anyhow::Result<()> {
    sql_query("UPDATE sync_peers SET is_master = false WHERE id = 'self'")
        .execute(conn)?;
    Ok(())
}

/// Check if this device is set as master
pub fn is_master(conn: &mut DbConn) -> anyhow::Result<bool> {
    #[derive(QueryableByName)]
    struct MasterRow {
        #[diesel(sql_type = diesel::sql_types::Bool)]
        is_master: bool,
    }
    
    let rows = sql_query("SELECT is_master FROM sync_peers WHERE id = 'self' LIMIT 1")
        .load::<MasterRow>(conn)?;
    
    Ok(rows.first().map(|r| r.is_master).unwrap_or(false))
}
