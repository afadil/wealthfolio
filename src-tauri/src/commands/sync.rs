#![cfg(feature = "wealthfolio-pro")]

use std::time::Duration;

use chrono::Utc;
use diesel::prelude::*;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Text};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::task;
use uuid::Uuid;

use crate::SyncHandles;
use wealthfolio_core::sync::engine::PeerPairingPayload;
use wealthfolio_core::sync::peer_store;
use wealthfolio_core::sync::store;

#[derive(Serialize)]
pub struct PeerInfo {
    id: String,
    name: String,
    address: String,
    paired: bool,
    last_seen: Option<String>,
    last_sync: Option<String>,
    is_master: bool,
}

#[derive(Serialize)]
pub struct SyncStatusResponse {
    device_id: String,
    device_name: String,
    is_master: bool,
    server_running: bool,
    master_device: Option<PeerInfo>,
    other_peers: Vec<PeerInfo>,
}

#[tauri::command]
pub async fn get_device_name() -> Result<String, String> {
    match hostname::get() {
        Ok(name) => Ok(name.to_string_lossy().to_string()),
        Err(_) => Ok("Unknown Device".to_string()),
    }
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, SyncHandles>) -> Result<SyncStatusResponse, String> {
    let device_id = state.engine.device_id();
    let device_name = get_device_name().await.unwrap_or_else(|_| "Unknown Device".to_string());

    let db_pool = state.engine.db_pool();
    let peers = {
        let mut conn = db_pool.get().map_err(|e| e.to_string())?;
        peer_store::load_peers(&mut conn).map_err(|e| e.to_string())?
    };

    let is_master = check_is_master(&state).await;

    let mut master_device = None;
    let mut other_peers = Vec::new();

    for peer in peers {
        if peer.id == device_id {
            continue;
        }
        let info = PeerInfo {
            id: peer.id.to_string(),
            name: peer.name.clone(),
            address: peer.address.clone(),
            paired: peer.paired,
            last_seen: peer.last_seen.map(|d| d.to_rfc3339()),
            last_sync: peer.last_sync.map(|d| d.to_rfc3339()),
            is_master: peer.is_master,
        };
        if peer.is_master {
            master_device = Some(info);
        } else {
            other_peers.push(info);
        }
    }

    Ok(SyncStatusResponse {
        device_id: device_id.to_string(),
        device_name,
        is_master,
        server_running: true,
        master_device,
        other_peers,
    })
}

async fn check_is_master(state: &State<'_, SyncHandles>) -> bool {
    let db_pool = state.engine.db_pool();
    match db_pool.get() {
        Ok(mut conn) => peer_store::is_local_master(&mut conn, &state.engine.device_id()).unwrap_or(false),
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn generate_pairing_payload(state: State<'_, SyncHandles>) -> Result<String, String> {
    let port = 33445;
    let (host, alt_hosts) = select_ips();

    let mut endpoints = Vec::new();
    push_endpoint(&mut endpoints, &host, port);
    for alt in &alt_hosts {
        if alt != &host {
            push_endpoint(&mut endpoints, alt, port);
        }
    }
    for endpoint in state.engine.listen_endpoints() {
        if !endpoints.contains(endpoint) {
            endpoints.push(endpoint.clone());
        }
    }

    let payload = serde_json::json!({
        "v": 2,
        "device_id": state.engine.device_id().to_string(),
        "device_name": get_device_name().await.unwrap_or_else(|_| "Unknown Device".to_string()),
        "fingerprint": state.engine.fingerprint().to_string(),
        "listen_endpoints": endpoints,
        "host": host,
        "alt": alt_hosts,
        "port": port,
        "ts": Utc::now().to_rfc3339(),
        "note": "Scan with Wealthfolio to pair",
    });

    Ok(payload.to_string())
}

fn push_endpoint(endpoints: &mut Vec<String>, host: &str, port: u16) {
    let candidate = format!("quic://{}:{}", host, port);
    if !endpoints.iter().any(|existing| existing == &candidate) {
        endpoints.push(candidate);
    }
}

#[derive(Deserialize)]
struct RawPairPayload {
    device_id: Option<Uuid>,
    device_name: Option<String>,
    fingerprint: Option<String>,
    listen_endpoints: Option<Vec<String>>,
    host: Option<String>,
    alt: Option<Vec<String>>,
    port: Option<u16>,
}

struct PairingRequest {
    remote_id: Uuid,
    remote_name: String,
    fingerprint: String,
    listen_endpoints: Vec<String>,
}

fn parse_pairing_payload(raw: &str) -> Result<PairingRequest, String> {
    let payload: RawPairPayload = serde_json::from_str(raw).map_err(|e| format!("Invalid payload: {e}"))?;
    let remote_id = payload
        .device_id
        .ok_or_else(|| "Pairing payload missing device_id".to_string())?;

    let listen_endpoints = if let Some(listen) = payload.listen_endpoints {
        if listen.is_empty() {
            build_endpoints_from_host(payload.host, payload.alt, payload.port)?
        } else {
            listen
        }
    } else {
        build_endpoints_from_host(payload.host, payload.alt, payload.port)?
    };

    if listen_endpoints.is_empty() {
        return Err("Pairing payload missing network endpoints".to_string());
    }

    let name = payload
        .device_name
        .unwrap_or_else(|| format!("Peer@{}", &remote_id.to_string()[..8]));

    Ok(PairingRequest {
        remote_id,
        remote_name: name,
        fingerprint: payload.fingerprint.unwrap_or_default(),
        listen_endpoints,
    })
}

fn build_endpoints_from_host(
    host: Option<String>,
    alt: Option<Vec<String>>,
    port: Option<u16>,
) -> Result<Vec<String>, String> {
    let host = host.ok_or_else(|| "Pairing payload missing host".to_string())?;
    let port = port.unwrap_or(33445);
    let mut endpoints = Vec::new();
    push_endpoint(&mut endpoints, &host, port);
    if let Some(alternates) = alt {
        for candidate in alternates {
            push_endpoint(&mut endpoints, &candidate, port);
        }
    }
    Ok(endpoints)
}

#[tauri::command]
pub async fn sync_with_master(state: State<'_, SyncHandles>, payload: String) -> Result<String, String> {
    let request = parse_pairing_payload(&payload)?;

    let pairing = PeerPairingPayload {
        id: request.remote_id,
        name: request.remote_name.clone(),
        listen_endpoints: request.listen_endpoints.clone(),
        fingerprint: request.fingerprint.clone(),
        pairing_token: None,
    };

    state
        .engine
        .upsert_peer(pairing)
        .await
        .map_err(|e| e.to_string())?;

    state
        .engine
        .sync_now(request.remote_id)
        .await
        .map_err(|e| format!("Sync failed: {e}"))?;

    Ok(format!("Successfully synced with {}", request.remote_name))
}

/// Attempt a short-lived TCP connection to trigger Local Network permission on iOS.
/// Always returns Ok(()) regardless of outcome; this is a preflight.
#[tauri::command]
pub async fn probe_local_network_access(host: String, port: u16) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    log::info!("Probing local network access to {}", addr);
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        let _ = tokio::time::timeout(Duration::from_secs(2), tokio::net::TcpStream::connect(&addr)).await;
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = tokio::time::timeout(Duration::from_secs(2), tokio::net::TcpStream::connect(&addr)).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_now(state: State<'_, SyncHandles>, peer_id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&peer_id).map_err(|e| e.to_string())?;
    state
        .engine
        .sync_now(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn force_full_sync_with_master(state: State<'_, SyncHandles>, payload: String) -> Result<String, String> {
    let request = parse_pairing_payload(&payload)?;

    let pairing = PeerPairingPayload {
        id: request.remote_id,
        name: request.remote_name.clone(),
        listen_endpoints: request.listen_endpoints.clone(),
        fingerprint: request.fingerprint.clone(),
        pairing_token: None,
    };

    state
        .engine
        .upsert_peer(pairing)
        .await
        .map_err(|e| e.to_string())?;

    let pool = state.engine.db_pool();
    {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        store::reset_peer_checkpoint(&mut conn, &request.remote_id.to_string()).map_err(|e| e.to_string())?;
    }

    state
        .engine
        .sync_now(request.remote_id)
        .await
        .map_err(|e| format!("Full sync failed: {e}"))?;

    Ok(format!("Full sync completed with {}", request.remote_name))
}

#[tauri::command]
pub async fn initialize_sync_for_existing_data(state: State<'_, SyncHandles>) -> Result<String, String> {
    let pool = state.engine.db_pool();
    let device_id = state.engine.device_id().to_string();

    let result: (usize, usize, usize) = task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        store::enable_pragmas(&mut conn).map_err(|e| e.to_string())?;
        initialize_existing_rows(&mut conn, &device_id)
    })
    .await
    .map_err(|e| e.to_string())??;

    let (accounts_updated, activities_updated, assets_updated) = result;
    Ok(format!(
        "Initialized sync metadata: {} accounts, {} activities, {} assets updated and ready for sync",
        accounts_updated, activities_updated, assets_updated
    ))
}

#[tauri::command]
pub async fn set_as_master(state: State<'_, SyncHandles>) -> Result<String, String> {
    let device_name = get_device_name().await.unwrap_or_else(|_| "This Device".to_string());
    let device_id = state.engine.device_id();
    let fingerprint = state.engine.fingerprint().to_string();
    let listen_endpoints: Vec<String> = state.engine.listen_endpoints().to_vec();

    let db_pool = state.engine.db_pool();
    let mut conn = db_pool.get().map_err(|e| e.to_string())?;
    peer_store::set_local_master(&mut conn, &device_id, &device_name, &fingerprint, &listen_endpoints)
        .map_err(|e| format!("Failed to set master status: {e}"))?;

    let peers = peer_store::load_peers(&mut conn).map_err(|e| e.to_string())?;
    for peer in peers {
        if peer.is_master && peer.id != device_id {
            let _ = peer_store::delete_peer(&mut conn, &peer.id);
        }
    }

    Ok("Device set as master. Other devices can now connect to this one.".to_string())
}

#[tauri::command]
pub async fn remove_master_device(state: State<'_, SyncHandles>) -> Result<String, String> {
    let device_id = state.engine.device_id();
    let db_pool = state.engine.db_pool();

    let mut conn = db_pool.get().map_err(|e| e.to_string())?;
    peer_store::clear_local_master(&mut conn, &device_id)
        .map_err(|e| format!("Failed to remove master status: {e}"))?;

    Ok("Master status removed. You can now pair with a new master device.".to_string())
}

fn select_ips() -> (String, Vec<String>) {
    if let Ok(host) = std::env::var("WF_SYNC_HOST") {
        return (host.clone(), vec![host]);
    }

    let mut primary: Option<String> = None;
    let mut candidates: Vec<String> = Vec::new();

    if let Ok(ifaces) = get_if_addrs::get_if_addrs() {
        for iface in ifaces {
            let name = iface.name.to_lowercase();
            if name.starts_with("lo") || name.contains("awdl") || name.contains("utun") || name.contains("llw") {
                continue;
            }
            let ip = match iface.addr {
                get_if_addrs::IfAddr::V4(v4) => v4.ip.to_string(),
                _ => continue,
            };
            if ip.starts_with("169.254.") || ip.starts_with("192.0.0.") {
                continue;
            }
            let is_private = ip.starts_with("10.")
                || ip.starts_with("192.168.")
                || (ip.starts_with("172.")
                    && ip
                        .split('.')
                        .nth(1)
                        .and_then(|s| s.parse::<u8>().ok())
                        .map(|b| (16..=31).contains(&b))
                        .unwrap_or(false));
            if !is_private {
                continue;
            }
            if !candidates.contains(&ip) {
                candidates.push(ip.clone());
            }
            if name == "en0" && primary.is_none() {
                primary = Some(ip.clone());
            }
        }
    }

    if primary.is_none() {
        primary = candidates.first().cloned();
    }

    let fallback = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".into());
    let chosen = primary.unwrap_or(fallback.clone());
    if !candidates.contains(&chosen) {
        candidates.insert(0, chosen.clone());
    }

    (chosen, candidates)
}

fn initialize_existing_rows(
    conn: &mut store::DbConn,
    device_id: &str,
) -> Result<(usize, usize, usize), String> {
    let accounts = mark_records(
        conn,
        "SELECT id as value FROM accounts WHERE updated_version = 0",
        "UPDATE accounts SET updated_version = ?1, origin = ?2 WHERE id = ?3",
        device_id,
    )?;
    let activities = mark_records(
        conn,
        "SELECT id as value FROM activities WHERE updated_version = 0",
        "UPDATE activities SET updated_version = ?1, origin = ?2 WHERE id = ?3",
        device_id,
    )?;
    let assets = mark_records(
        conn,
        "SELECT id as value FROM assets WHERE updated_version = 0",
        "UPDATE assets SET updated_version = ?1, origin = ?2 WHERE id = ?3",
        device_id,
    )?;

    Ok((accounts, activities, assets))
}

fn mark_records(
    conn: &mut store::DbConn,
    select_sql: &str,
    update_sql: &str,
    device_id: &str,
) -> Result<usize, String> {
    #[derive(QueryableByName)]
    struct IdRow {
        #[diesel(sql_type = Text)]
        value: String,
    }

    let rows = sql_query(select_sql)
        .load::<IdRow>(conn)
        .map_err(|e| e.to_string())?;

    for row in &rows {
        let version = store::bump_clock(conn).map_err(|e| e.to_string())?;
        sql_query(update_sql)
            .bind::<BigInt, _>(version)
            .bind::<Text, _>(device_id)
            .bind::<Text, _>(&row.value)
            .execute(conn)
            .map_err(|e| e.to_string())?;
    }

    Ok(rows.len())
}
