use tauri::State;
use crate::SyncHandles;
use serde::Serialize;
use chrono::Utc;
use uuid::Uuid;

#[derive(Serialize)]
struct PeerInfo {
    id: String,
    name: String,
    address: String,
    paired: bool,
    last_seen: Option<String>,
    last_sync: Option<String>,
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, SyncHandles>) -> Result<serde_json::Value, String> {
    let peers = state.engine.get_peers().await;
    let list: Vec<PeerInfo> = peers.into_iter().map(|p| PeerInfo {
        id: p.id.to_string(),
        name: p.name,
        address: p.address,
        paired: p.paired,
        last_seen: Some(p.last_seen.to_rfc3339()),
        last_sync: p.last_sync.map(|d| d.to_rfc3339()),
    }).collect();
    Ok(serde_json::json!({
        "device_id": state.engine.device_id().to_string(),
        "peers": list
    }))
}

#[tauri::command]
pub async fn generate_pairing_payload() -> Result<String, String> {
    let port = 33445; // fixed for now
    let (host, alt) = select_ips();
    let payload = serde_json::json!({
        "v": 1,
        "host": host,
        "alt": alt,
        "port": port,
        "ts": Utc::now().to_rfc3339(),
        "note": "Scan with mobile Wealthfolio app to sync"
    });
    Ok(payload.to_string())
}

fn select_ips() -> (String, Vec<String>) {
    // Env override first
    if let Ok(host) = std::env::var("WF_SYNC_HOST") { return (host.clone(), vec![host]); }
    let mut primary: Option<String> = None;
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(ifaces) = get_if_addrs::get_if_addrs() {
        for iface in ifaces {
            let name = iface.name.to_lowercase();
            if name.starts_with("lo") || name.contains("awdl") || name.contains("utun") || name.contains("llw") { continue; }
            let ip = match iface.addr { get_if_addrs::IfAddr::V4(v4) => v4.ip.to_string(), _ => continue };
            if ip.starts_with("169.254.") || ip.starts_with("192.0.0.") { continue; }
            let is_private = ip.starts_with("10.") || ip.starts_with("192.168.") || (ip.starts_with("172.") && ip.split('.').nth(1).and_then(|s| s.parse::<u8>().ok()).map(|b| (16..=31).contains(&b)).unwrap_or(false));
            if !is_private { continue; }
            if !candidates.contains(&ip) { candidates.push(ip.clone()); }
            if name == "en0" && primary.is_none() { primary = Some(ip.clone()); }
        }
    }
    if primary.is_none() { primary = candidates.first().cloned(); }
    let fallback = local_ip_address::local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".into());
    let chosen = primary.unwrap_or(fallback.clone());
    if !candidates.contains(&chosen) { candidates.insert(0, chosen.clone()); }
    (chosen, candidates)
}

#[tauri::command]
pub async fn sync_with_master(state: State<'_, SyncHandles>, payload: String) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    struct PairPayload { host: String, port: u16 }
    let parsed: PairPayload = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    // Create ephemeral peer struct
    let peer = wealthfolio_core::sync::engine::Peer {
        id: Uuid::new_v4(),
        name: format!("Master@{}", parsed.host),
        address: format!("{}:{}", parsed.host, parsed.port),
        fingerprint: String::new(),
        paired: true,
        last_seen: Utc::now(),
        last_sync: None,
    };
    state.engine.add_peer(peer.clone()).await.map_err(|e| e.to_string())?; // store for visibility
    state.engine.sync_with_peer(peer.id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_now(state: State<'_, SyncHandles>, peer_id: String) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&peer_id).map_err(|e| e.to_string())?;
    state.engine.sync_with_peer(id).await.map_err(|e| e.to_string())
}

// Exports for invoke_handler macro (to be added in lib.rs later if desired)
