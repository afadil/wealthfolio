#![cfg(feature = "wealthfolio-pro")]

use std::collections::HashSet;
use std::time::Duration;
use chrono::Utc;
use diesel::prelude::RunQueryDsl;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::{
    events::{emit_resource_changed, ResourceEventPayload},
    SyncHandles,
};
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

fn endpoint_is_routable(endpoint: &str) -> bool {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return false;
    }

    let normalized = if trimmed.contains("://") {
        trimmed.to_ascii_lowercase()
    } else {
        format!("quic://{}", trimmed).to_ascii_lowercase()
    };

    !(normalized.contains("://0.0.0.0")
        || normalized.contains("://[::]")
        || normalized.contains("://localhost"))
}

fn sanitize_endpoints<I>(candidates: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();

    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut normalized = trimmed.to_string();
        if !normalized.contains("://") {
            normalized = format!("quic://{}", normalized.trim_start_matches("quic://"));
        }

        let lower = normalized.to_lowercase();
        if lower.contains("://0.0.0.0")
            || lower.contains("://[::]")
            || lower.contains("://localhost")
        {
            continue;
        }

        if seen.insert(lower) {
            cleaned.push(normalized);
        }
    }

    cleaned
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
            let sanitized_endpoints = sanitize_endpoints(peer.listen_endpoints.clone());
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

    let mut listen_endpoints = sanitize_endpoints(endpoint_candidates);
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
    let payload: RawPairPayload =
        serde_json::from_str(raw).map_err(|e| format!("Invalid payload: {e}"))?;
    let remote_id = payload
        .device_id
        .ok_or_else(|| "Pairing payload missing device_id".to_string())?;

    let listen_endpoints = if let Some(listen) = payload.listen_endpoints {
        let cleaned = sanitize_endpoints(listen.into_iter());
        if cleaned.is_empty() {
            build_endpoints_from_host(payload.host, payload.alt, payload.port)?
        } else {
            cleaned
        }
    } else {
        build_endpoints_from_host(payload.host, payload.alt, payload.port)?
    };

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
    endpoints.push(format!("quic://{}:{}", host, port));
    if let Some(alternates) = alt {
        for candidate in alternates {
            endpoints.push(format!("quic://{}:{}", candidate, port));
        }
    }
    let cleaned = sanitize_endpoints(endpoints);
    if cleaned.is_empty() {
        Err("Pairing payload missing routable endpoints".to_string())
    } else {
        Ok(cleaned)
    }
}

#[tauri::command]
pub async fn sync_with_peer(
    state: State<'_, SyncHandles>,
    handle: AppHandle,
    payload: String,
) -> Result<String, String> {
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

    let pool = state.engine.db_pool();
    if let Ok(mut conn) = pool.get() {
        if let Ok(Some(peer)) = peer_store::get_peer_by_id(&mut conn, &id) {
            let endpoints = sanitize_endpoints(peer.listen_endpoints.clone());
            let has_address = endpoint_is_routable(&peer.address);
            if endpoints.is_empty() && !has_address {
                return Err("Peer has no routable endpoints. Regenerate the pairing code on that device and scan it again.".to_string());
            }
        }
    }

    state.engine.sync_now(id).await.map_err(|e| e.to_string())?;
    emit_sync_completed(&handle);
    Ok(())
}

#[tauri::command]
pub async fn force_full_sync_with_peer(
    state: State<'_, SyncHandles>,
    handle: AppHandle,
    payload: String,
) -> Result<String, String> {
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
        store::reset_peer_checkpoint(&mut conn, &request.remote_id.to_string())
            .map_err(|e| e.to_string())?;
    }

    state
        .engine
        .sync_now(request.remote_id)
        .await
        .map_err(|e| format!("Full sync failed: {e}"))?;

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
