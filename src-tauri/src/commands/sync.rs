use tauri::State;
use crate::SyncHandles;
use serde::Serialize;
use chrono::Utc;
use uuid::Uuid;
use wealthfolio_core::sync::peer_store;
use std::time::Duration;

#[derive(Serialize)]
pub struct PeerInfo {
    id: String,
    name: String,
    address: String,
    paired: bool,
    last_seen: Option<String>,
    last_sync: Option<String>,
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
    // Try to get hostname/computer name
    match hostname::get() {
        Ok(name) => {
            if let Some(name_str) = name.to_str() {
                Ok(name_str.to_string())
            } else {
                Ok("Unknown Device".to_string())
            }
        }
        Err(_) => Ok("Unknown Device".to_string())
    }
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, SyncHandles>) -> Result<SyncStatusResponse, String> {
    // Refresh peers from database to pick up any new connections
    state.engine.refresh_peers_from_db().await.map_err(|e| e.to_string())?;
    
    let peers = state.engine.get_peers().await;
    let device_name = get_device_name().await.unwrap_or_else(|_| "Unknown Device".to_string());
    
    // Check if this device is set as master
    let is_master = check_is_master(&state).await;
    
    // Separate master device from other peers
    let mut master_device = None;
    let mut other_peers = Vec::new();
    
    for peer in peers {
        let is_master = peer.name.contains("Master@");
        
        let peer_info = PeerInfo {
            id: peer.id.to_string(),
            name: peer.name,
            address: peer.address,
            paired: peer.paired,
            last_seen: Some(peer.last_seen.to_rfc3339()),
            last_sync: peer.last_sync.map(|d| d.to_rfc3339()),
        };
        
        if is_master {
            master_device = Some(peer_info);
        } else {
            other_peers.push(peer_info);
        }
    }
    
    Ok(SyncStatusResponse {
        device_id: state.engine.device_id().to_string(),
        device_name,
        is_master,
        server_running: state.engine.is_server_running().await,
        master_device,
        other_peers,
    })
}

async fn check_is_master(state: &State<'_, SyncHandles>) -> bool {
    // Check if this device is configured as master in the database
    let db_pool = state.engine.get_db_pool();
    
    match db_pool.get() {
        Ok(mut conn) => {
            peer_store::is_master(&mut conn).unwrap_or(false)
        }
        Err(_) => false,
    }
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
pub async fn sync_with_master(state: State<'_, SyncHandles>, payload: String) -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct PairPayload { host: String, port: u16 }
    
    let parsed: PairPayload = serde_json::from_str(&payload).map_err(|e| format!("Invalid payload: {}", e))?;
    
    // Check if sync engine is running
    if !state.engine.is_server_running().await {
        return Err("Sync engine is not running. Please restart the app.".to_string());
    }
    
    // Create peer struct
    let peer = wealthfolio_core::sync::engine::Peer {
        id: Uuid::new_v4(),
        name: format!("Master@{}", parsed.host),
        address: format!("{}:{}", parsed.host, parsed.port),
        fingerprint: String::new(),
        paired: true,
        last_seen: Utc::now(),
        last_sync: None,
    };
    
    // Test connection first
    let test_url = format!("ws://{}/ws", peer.address);
    log::info!("Testing connection to {}", test_url);
    
    // Try once; on failure, allow for local-network permission prompt and retry once
    let attempt_connect = | | async {
        tokio::time::timeout(Duration::from_secs(5), wealthfolio_core::sync::transport::connect_to_peer(&test_url)).await
    };

    let mut connected = false;
    match attempt_connect().await {
        Ok(Ok(_ws)) => {
            log::info!("Connection test successful on first attempt");
            connected = true;
        }
        Ok(Err(e)) => {
            log::warn!("First connection attempt failed: {}. Retrying...", e);
        }
        Err(_) => {
            log::warn!("First connection attempt timed out. Retrying...");
        }
    }

    if !connected {
        // Small delay to allow iOS local network permission dialog resolution
        tokio::time::sleep(Duration::from_millis(600)).await;
        match attempt_connect().await {
            Ok(Ok(_ws)) => {
                log::info!("Connection test successful on retry");
            }
            Ok(Err(e)) => {
                return Err(format!("Cannot connect to {}: {}", peer.address, e));
            }
            Err(_) => {
                return Err(format!("Connection timeout to {}", peer.address));
            }
        }
    }
    
    // Add peer and sync
    state.engine.add_peer(peer.clone()).await.map_err(|e| e.to_string())?;
    state.engine.sync_with_peer(peer.id).await.map_err(|e| format!("Sync failed: {}", e))?;
    
    Ok(format!("Successfully synced with {}", peer.name))
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
    let id = uuid::Uuid::parse_str(&peer_id).map_err(|e| e.to_string())?;
    state.engine.sync_with_peer(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn force_full_sync_with_master(state: State<'_, SyncHandles>, payload: String) -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct PairPayload { host: String, port: u16 }
    let parsed: PairPayload = serde_json::from_str(&payload).map_err(|e| format!("Invalid payload: {}", e))?;
    
    // Check if sync engine is running
    if !state.engine.is_server_running().await {
        return Err("Sync engine is not running. Please restart the app.".to_string());
    }
    
    // Create peer struct
    let peer = wealthfolio_core::sync::engine::Peer {
        id: Uuid::new_v4(),
        name: format!("Master@{}", parsed.host),
        address: format!("{}:{}", parsed.host, parsed.port),
        fingerprint: String::new(),
        paired: true,
        last_seen: Utc::now(),
        last_sync: None,
    };
    
    // Reset checkpoints to force full sync (start from 0)
    let pool = state.engine.get_db_pool();
    let mut conn = pool.get().map_err(|e| e.to_string())?;
    wealthfolio_core::sync::store::set_checkpoint_received(&mut conn, &peer.id.to_string(), 0)
        .map_err(|e| e.to_string())?;
    wealthfolio_core::sync::store::set_checkpoint_sent(&mut conn, &peer.id.to_string(), 0)
        .map_err(|e| e.to_string())?;
    
    state.engine.add_peer(peer.clone()).await.map_err(|e| e.to_string())?;
    state.engine.sync_with_peer(peer.id).await.map_err(|e| format!("Full sync failed: {}", e))?;
    
    Ok(format!("Full sync completed with {}", peer.name))
}

#[tauri::command]
pub async fn initialize_sync_for_existing_data(state: State<'_, SyncHandles>) -> Result<String, String> {
    let (accounts_updated, activities_updated, assets_updated) = state.engine
        .initialize_existing_data()
        .await
        .map_err(|e| e.to_string())?;
    
    let summary = format!(
        "Initialized sync metadata: {} accounts, {} activities, {} assets updated and ready for sync",
        accounts_updated, activities_updated, assets_updated
    );
    
    Ok(summary)
}

#[tauri::command]
pub async fn set_as_master(state: State<'_, SyncHandles>) -> Result<String, String> {
    let device_name = get_device_name().await.unwrap_or_else(|_| "This Device".to_string());
    let db_pool = state.engine.get_db_pool();
    
    match db_pool.get() {
        Ok(mut conn) => {
            peer_store::set_as_master(&mut conn, &device_name)
                .map_err(|e| format!("Failed to set master status: {}", e))?;
        }
        Err(e) => return Err(format!("Failed to get database connection: {}", e)),
    }
    
    // Remove all master devices from peers to establish this device as master
    let peers = state.engine.get_peers().await;
    for peer in peers {
        if peer.name.contains("Master@") {
            state.engine.remove_peer(peer.id).await.map_err(|e| e.to_string())?;
        }
    }
    
    // Ensure sync server is running for master devices
    if !state.engine.is_server_running().await {
        return Err("Cannot set as master: sync server is not running. Please restart the app.".to_string());
    }
    
    Ok("Device set as master. Other devices can now connect to this one.".to_string())
}

#[tauri::command]
pub async fn remove_master_device(state: State<'_, SyncHandles>) -> Result<String, String> {
    let db_pool = state.engine.get_db_pool();
    
    // Remove master status from this device
    match db_pool.get() {
        Ok(mut conn) => {
            peer_store::remove_master_status(&mut conn)
                .map_err(|e| format!("Failed to remove master status: {}", e))?;
        }
        Err(e) => return Err(format!("Failed to get database connection: {}", e)),
    }
    
    // Remove all master devices from peers
    let peers = state.engine.get_peers().await;
    for peer in peers {
        if peer.name.contains("Master@") {
            state.engine.remove_peer(peer.id).await.map_err(|e| e.to_string())?;
        }
    }
    
    Ok("Master status removed. You can now pair with a new master device.".to_string())
}

// Exports for invoke_handler macro (to be added in lib.rs later if desired)
