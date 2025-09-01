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
    // Determine a local IP (best-effort). Fallback to localhost.
    let host = local_ip_address::local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".into());
    let port = 33445; // fixed for now
    let payload = serde_json::json!({
        "v": 1,
        "host": host,
        "port": port,
        "ts": Utc::now().to_rfc3339(),
        "note": "Scan with mobile Wealthfolio app to sync"
    });
    Ok(payload.to_string())
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
