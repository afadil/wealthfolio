#![cfg(feature = "wealthfolio-pro")]

use std::time::Duration;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::{
    events::{emit_resource_changed, ResourceEventPayload},
    SyncHandles,
};
use wealthfolio_core::sync::engine::PeerPairingPayload;
use wealthfolio_core::sync::pairing::{self, PairingRequest};
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
    fingerprint: String,
    listen_endpoints: Vec<String>,
}

#[derive(Serialize)]
pub struct SyncStatusResponse {
    device_id: String,
    device_name: String,
    server_running: bool,
    peers: Vec<PeerInfo>,
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
    let device_name = get_device_name()
        .await
        .unwrap_or_else(|_| "Unknown Device".to_string());

    let db_pool = state.engine.db_pool();
    let peers = {
        let mut conn = db_pool.get().map_err(|e| e.to_string())?;
        peer_store::load_peers(&mut conn).map_err(|e| e.to_string())?
    };

    let peers = peers
        .into_iter()
        .filter(|peer| peer.id != device_id)
        .map(|peer| {
            let sanitized_endpoints = pairing::sanitize_endpoints(peer.listen_endpoints.clone());
            let address = sanitized_endpoints
                .first()
                .cloned()
                .unwrap_or_else(|| peer.address.clone());
            PeerInfo {
                id: peer.id.to_string(),
                name: peer.name,
                address,
                paired: peer.paired,
                last_seen: peer.last_seen.map(|d| d.to_rfc3339()),
                last_sync: peer.last_sync.map(|d| d.to_rfc3339()),
                fingerprint: peer.fingerprint,
                listen_endpoints: sanitized_endpoints,
            }
        })
        .collect();

    Ok(SyncStatusResponse {
        device_id: device_id.to_string(),
        device_name,
        server_running: true,
        peers,
    })
}

#[tauri::command]
pub async fn generate_pairing_payload(state: State<'_, SyncHandles>) -> Result<String, String> {
    let port = 33445;
    let (host, raw_hosts) = select_ips();

    let mut endpoint_candidates = Vec::new();
    endpoint_candidates.push(format!("quic://{}:{}", host, port));
    for alt in &raw_hosts {
        if alt != &host {
            endpoint_candidates.push(format!("quic://{}:{}", alt, port));
        }
    }
    for endpoint in state.engine.listen_endpoints() {
        endpoint_candidates.push(endpoint.clone());
    }

    let mut listen_endpoints = pairing::sanitize_endpoints(endpoint_candidates);
    if listen_endpoints.is_empty() {
        listen_endpoints.push(format!("quic://{}:{}", host, port));
    }

    let mut alt_hosts: Vec<String> = raw_hosts
        .into_iter()
        .filter(|alt| alt != &host)
        .filter(|alt| !alt.trim().is_empty() && alt != "0.0.0.0" && alt != "::")
        .collect();
    alt_hosts.sort();
    alt_hosts.dedup();

    let payload = serde_json::json!({
        "v": 2,
        "device_id": state.engine.device_id().to_string(),
        "device_name": get_device_name().await.unwrap_or_else(|_| "Unknown Device".to_string()),
        "fingerprint": state.engine.fingerprint().to_string(),
        "listen_endpoints": listen_endpoints,
        "host": host,
        "alt": alt_hosts,
        "port": port,
        "ts": Utc::now().to_rfc3339(),
        "note": "Scan with Wealthfolio to pair",
    });

    Ok(payload.to_string())
}

async fn upsert_peer_from_payload(
    state: &State<'_, SyncHandles>,
    payload: &str,
) -> Result<PairingRequest, String> {
    log::info!("[pairing] received payload: {}", payload);
    let request = match pairing::parse_pairing_payload(payload) {
        Ok(req) => req,
        Err(_) => return Err("Invalid QR code".to_string()),
    };

    log::info!(
        "[pairing] parsed endpoints for {}: {:?}",
        request.remote_name,
        request.listen_endpoints
    );

    let pairing_payload = PeerPairingPayload {
        id: request.remote_id,
        name: request.remote_name.clone(),
        listen_endpoints: request.listen_endpoints.clone(),
        fingerprint: request.fingerprint.clone(),
        pairing_token: None,
    };

    log::info!(
        "[pairing] storing peer {} endpoints={:?}",
        pairing_payload.name,
        pairing_payload.listen_endpoints
    );

    state
        .engine
        .upsert_peer(pairing_payload)
        .await
        .map_err(|_| "Failed to pair this device. Please try again.".to_string())?;

    Ok(request)
}

#[tauri::command]
pub async fn sync_with_peer(
    state: State<'_, SyncHandles>,
    handle: AppHandle,
    payload: String,
) -> Result<String, String> {
    let request = upsert_peer_from_payload(&state, &payload).await?;

    state
        .engine
        .sync_now(request.remote_id)
        .await
        .map_err(|err| {
            let msg = err.to_string();
            log::error!("sync_with_peer error: {}", msg);
            "Sync failed after pairing. Please try again.".to_string()
        })?;

    emit_sync_completed(&handle);

    Ok(format!("Successfully synced with {}", request.remote_name))
}

/// Attempt a short-lived TCP connection to trigger Local Network permission on iOS.
/// Always returns Ok(()) regardless of outcome; this is a preflight.
#[tauri::command]
pub async fn probe_local_network_access(host: String, port: u16) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    {
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            tokio::net::TcpStream::connect(&addr),
        )
        .await;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct SyncNowArgs {
    #[serde(alias = "peerId")]
    peer_id: String,
}

#[tauri::command]
pub async fn sync_now(state: State<'_, SyncHandles>, handle: AppHandle, payload: SyncNowArgs) -> Result<(), String> {
    let id = Uuid::parse_str(&payload.peer_id).map_err(|e| e.to_string())?;

    state
        .engine
        .sync_now(id)
        .await
        .map_err(|err| {
            let msg = err.to_string();
            log::error!("sync_now error: {}", msg);
            "Failed to sync with this device. Please try again.".to_string()
        })?;
    emit_sync_completed(&handle);
    Ok(())
}

#[tauri::command]
pub async fn force_full_sync_with_peer(
    state: State<'_, SyncHandles>,
    handle: AppHandle,
    payload: String,
) -> Result<String, String> {
    let request = upsert_peer_from_payload(&state, &payload).await?;

    let pool = state.engine.db_pool();
    {
        let mut conn = pool.get().map_err(|_| "Failed to pair this device. Please try again.".to_string())?;
        store::reset_peer_checkpoint(&mut conn, &request.remote_id.to_string())
            .map_err(|_| "Failed to pair this device. Please try again.".to_string())?;
    }

    state
        .engine
        .sync_now(request.remote_id)
        .await
        .map_err(|_| "Full sync failed. Please try again.".to_string())?;

    emit_sync_completed(&handle);

    Ok(format!("Full sync completed with {}", request.remote_name))
}

#[tauri::command]
pub async fn initialize_sync_for_existing_data(
    state: State<'_, SyncHandles>,
) -> Result<String, String> {
    let stats = state
        .engine
        .initialize_existing_data()
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "Initialized sync metadata: {accounts} accounts, {assets} assets, {activities} activities, {profiles} profiles, {settings} settings, {limits} limits, {goals} goals, {allocations} allocations",
        accounts = stats.accounts,
        assets = stats.assets,
        activities = stats.activities,
        profiles = stats.profiles,
        settings = stats.settings,
        limits = stats.limits,
        goals = stats.goals,
        allocations = stats.allocations,
    ))
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
            if name.starts_with("lo")
                || name.contains("awdl")
                || name.contains("utun")
                || name.contains("llw")
            {
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

fn emit_sync_completed(handle: &AppHandle) {
    emit_resource_changed(
        handle,
        ResourceEventPayload::new("sync", "completed", json!({})),
    );
}
