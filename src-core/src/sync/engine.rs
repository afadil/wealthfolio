// sync/engine.rs
use crate::db::DbPool;
use crate::sync::store;
use crate::sync::transport::{connect_to_peer, send_message, start_server};
use crate::sync::types::WireMessage;

use anyhow::Context;
use futures::StreamExt;
use log::{error, info, warn};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use uuid::Uuid;

const SYNC_INTERVAL_SECS: u64 = 300; // 5 minutes
const BATCH_LIMIT: i64 = 1000;
const ACK_TIMEOUT_SECS: u64 = 5;
const ACK_POLL_MS: u64 = 500;

#[derive(Debug, Clone)]
pub struct Peer {
    pub id: Uuid,
    pub name: String,
    pub address: String, // "host:port"
    pub fingerprint: String,
    pub paired: bool,
    pub last_seen: chrono::DateTime<chrono::Utc>,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug)]
pub struct SyncEngine {
    db_pool: Arc<DbPool>,
    device_id: Uuid,
    peers: Arc<RwLock<HashMap<Uuid, Peer>>>,
    server_addr: String,
    is_running: Arc<RwLock<bool>>,
}

impl SyncEngine {
    /// Prefer passing in a stable, per-device ID from keychain and mirroring it into `sync_device`.
    /// This constructor generates a new UUID (useful for tests).
    pub fn new(db_pool: Arc<DbPool>) -> anyhow::Result<Self> {
        let device_id = Uuid::new_v4();

        // Persist device_id into DB so triggers can stamp `origin`.
        {
            let mut conn = db_pool.get()?;
            store::enable_pragmas(&mut conn).ok();
            store::ensure_device_id(&mut conn, &device_id.to_string())?;
        }

        Ok(Self {
            db_pool,
            device_id,
            peers: Arc::new(RwLock::new(HashMap::new())),
            server_addr: "0.0.0.0:33445".to_string(),
            is_running: Arc::new(RwLock::new(false)),
        })
    }

    /// If you already have a stable device_id (recommended), use this.
    pub fn with_device_id(db_pool: Arc<DbPool>, device_id: Uuid) -> anyhow::Result<Self> {
        {
            let mut conn = db_pool.get()?;
            store::enable_pragmas(&mut conn).ok();
            store::ensure_device_id(&mut conn, &device_id.to_string())?;
        }
        Ok(Self {
            db_pool,
            device_id,
            peers: Arc::new(RwLock::new(HashMap::new())),
            server_addr: "0.0.0.0:33445".to_string(),
            is_running: Arc::new(RwLock::new(false)),
        })
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        let mut is_running = self.is_running.write().await;
        if *is_running {
            warn!("Sync engine already running");
            return Ok(());
        }
        *is_running = true;
        drop(is_running);

        info!(
            "Starting sync engine as {} on {}",
            self.device_id, self.server_addr
        );

        // Start WebSocket server (plain ws). For wss, call your TLS server here.
        let addr = self.server_addr.clone();
        let pool = self.db_pool.clone();
        let device = self.device_id;
        tokio::spawn(async move {
            if let Err(e) = start_server(&addr, pool, device).await {
                error!("Transport server error: {e}");
            }
        });

    // Discovery removed – pairing now initiated via QR code (manual connect).

        // Periodic background loop
        self.start_sync_loop().await;
        Ok(())
    }

    pub fn device_id(&self) -> Uuid { self.device_id }

    pub async fn stop(&self) -> anyhow::Result<()> {
        let mut is_running = self.is_running.write().await;
        *is_running = false;
        Ok(())
    }

    pub async fn add_peer(&self, peer: Peer) -> anyhow::Result<()> {
        self.peers.write().await.insert(peer.id, peer);
        Ok(())
    }

    pub async fn remove_peer(&self, peer_id: Uuid) -> anyhow::Result<()> {
        self.peers.write().await.remove(&peer_id);
        Ok(())
    }

    pub async fn get_peers(&self) -> Vec<Peer> {
        self.peers.read().await.values().cloned().collect()
    }

    async fn start_sync_loop(&self) {
        let is_running = self.is_running.clone();
        let peers = self.peers.clone();
        let db_pool = self.db_pool.clone();
        let device_id = self.device_id;

        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(std::time::Duration::from_secs(SYNC_INTERVAL_SECS));
            while *is_running.read().await {
                interval.tick().await;

                let targets: Vec<Peer> = {
                    let p = peers.read().await;
                    p.values().filter(|x| x.paired).cloned().collect()
                };

                for peer in targets {
                    if let Err(e) =
                        Self::sync_with_peer_minimal(&db_pool, device_id, &peer).await
                    {
                        error!("Sync with {} failed: {e}", peer.name);
                    }
                }
            }
        });
    }

    pub async fn sync_with_peer(&self, peer_id: Uuid) -> anyhow::Result<()> {
        let peer = {
            let peers = self.peers.read().await;
            peers.get(&peer_id).cloned().context("Peer not found")?
        };
        Self::sync_with_peer_minimal(&self.db_pool, self.device_id, &peer).await
    }

    async fn sync_with_peer_minimal(
        db_pool: &Arc<DbPool>,
        device_id: Uuid,
        peer: &Peer,
    ) -> anyhow::Result<()> {
        info!("Sync -> {} at {}", peer.name, peer.address);
        let ws_url = format!("ws://{}/ws", peer.address);

        // Use transport helper (for TLS swap later).
        let mut ws_stream = connect_to_peer(&ws_url).await?;

        // 1) Hello
        let hello = WireMessage::Hello {
            message_id: Uuid::new_v4(),
            device_id,
            app: "wealthfolio".into(),
            schema: 1,
            capabilities: vec!["lww".into()],
        };
        send_message(&mut ws_stream, &hello).await?;

        // 2) Since = our last_version_received for this peer
        let since = {
            let mut conn = db_pool.get()?;
            store::enable_pragmas(&mut conn).ok();
            store::get_checkpoint_received(&mut conn, &peer.id.to_string())?
        };

        // 3) Pull from peer
        let pull = WireMessage::Pull {
            message_id: Uuid::new_v4(),
            since,
            limit: BATCH_LIMIT,
        };
        send_message(&mut ws_stream, &pull).await?;

        // 4) Receive and apply their batches (accounts -> assets -> activities). Stop after done=true.
        let mut received_accounts = false;
        let mut received_assets = false;
        let mut received_activities = false;
        let mut applied_max: i64 = since;

        loop {
            match ws_stream.next().await {
                Some(Ok(TungsteniteMessage::Text(txt))) => match serde_json::from_str::<WireMessage>(&txt) {
                    Ok(WireMessage::AccountsBatch { rows, max_version, .. }) => {
                        let mut conn = db_pool.get()?;
                        store::apply_accounts(&mut conn, &rows)?;
                        if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
                            applied_max = applied_max.max(m);
                        }
                        let ack = WireMessage::Ack {
                            message_id: Uuid::new_v4(),
                            applied_through: applied_max.max(max_version),
                        };
                        send_message(&mut ws_stream, &ack).await?;
                        received_accounts = true;
                    }
                    Ok(WireMessage::AssetsBatch { rows, max_version, .. }) => {
                        let mut conn = db_pool.get()?;
                        store::apply_assets(&mut conn, &rows)?;
                        if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
                            applied_max = applied_max.max(m);
                        }
                        let ack = WireMessage::Ack {
                            message_id: Uuid::new_v4(),
                            applied_through: applied_max.max(max_version),
                        };
                        send_message(&mut ws_stream, &ack).await?;
                        received_assets = true;
                    }
                    Ok(WireMessage::ActivitiesBatch { rows, max_version, done, .. }) => {
                        let mut conn = db_pool.get()?;
                        store::apply_activities(&mut conn, &rows)?;
                        if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
                            applied_max = applied_max.max(m);
                        }
                        let ack = WireMessage::Ack {
                            message_id: Uuid::new_v4(),
                            applied_through: applied_max.max(max_version),
                        };
                        send_message(&mut ws_stream, &ack).await?;
                        received_activities = true;

                        if done {
                            // Update our last_version_received checkpoint and stop pull
                            let mut conn = db_pool.get()?;
                            store::set_checkpoint_received(
                                &mut conn,
                                &peer.id.to_string(),
                                applied_max,
                            )?;
                            break;
                        }
                    }
                    Ok(WireMessage::Hello { .. }) => { /* ignore */ }
                    Ok(WireMessage::Pull { .. }) => {
                        // Peer shouldn't Pull in this direction during our pull phase.
                    }
                    Ok(WireMessage::Ack { .. }) => { /* ignore */ }
                    Err(e) => {
                        return Err(anyhow::anyhow!(
                            "JSON parse error while pulling from {}: {e}",
                            peer.name
                        ));
                    }
                },
                Some(Ok(TungsteniteMessage::Close(_))) | None => {
                    info!("Peer {} closed during pull", peer.name);
                    break;
                }
                _ => {}
            }
        }

        if !(received_accounts && received_assets && received_activities) {
            info!(
                "Peer {} did not send full batches (acc: {}, assets: {}, acts: {}); ending early.",
                peer.name, received_accounts, received_assets, received_activities
            );
            return Ok(());
        }

        // 5) Push our changes (since our last_version_sent)
        let mut conn = db_pool.get()?;
        let send_since = store::get_checkpoint_sent(&mut conn, &peer.id.to_string())?;
        let our_max = store::max_version(&mut conn).unwrap_or(0);

        // Accounts
        let accounts = store::get_accounts_since(&mut conn, send_since, BATCH_LIMIT)?;
        let sent_accounts = !accounts.is_empty();
        if sent_accounts {
            let batch = WireMessage::AccountsBatch {
                message_id: Uuid::new_v4(),
                rows: accounts,
                max_version: our_max,
                done: false,
            };
            send_message(&mut ws_stream, &batch).await?;
        }

        // Assets
        let assets = store::get_assets_since(&mut conn, send_since, BATCH_LIMIT)?;
        let sent_assets = !assets.is_empty();
        if sent_assets {
            let batch = WireMessage::AssetsBatch {
                message_id: Uuid::new_v4(),
                rows: assets,
                max_version: our_max,
                done: false,
            };
            send_message(&mut ws_stream, &batch).await?;
        }

        // Activities
        let activities = store::get_activities_since(&mut conn, send_since, BATCH_LIMIT)?;
        let sent_activities = !activities.is_empty();
        if sent_activities {
            let batch = WireMessage::ActivitiesBatch {
                message_id: Uuid::new_v4(),
                rows: activities,
                max_version: our_max,
                done: true,
            };
            send_message(&mut ws_stream, &batch).await?;
        }

        drop(conn);

        // 6) Wait for acks to advance last_version_sent (0..3 acks depending on what we sent)
        let expected_acks: i32 =
            (sent_accounts as i32) + (sent_assets as i32) + (sent_activities as i32);
        let mut acked: i32 = 0;
        let mut ack_max: i64 = send_since;
        let ack_deadline = tokio::time::Instant::now()
            + std::time::Duration::from_secs(ACK_TIMEOUT_SECS);

        while acked < expected_acks && tokio::time::Instant::now() < ack_deadline {
            match tokio::time::timeout(
                std::time::Duration::from_millis(ACK_POLL_MS),
                ws_stream.next(),
            )
            .await
            {
                Ok(Some(Ok(TungsteniteMessage::Text(txt)))) => {
                    if let Ok(WireMessage::Ack { applied_through, .. }) =
                        serde_json::from_str::<WireMessage>(&txt)
                    {
                        acked += 1;
                        if applied_through > ack_max {
                            ack_max = applied_through;
                        }
                    }
                }
                Ok(Some(Ok(TungsteniteMessage::Close(_)))) | Ok(None) => break,
                _ => {}
            }
        }

        if acked > 0 {
            let mut conn = db_pool.get()?;
            store::set_checkpoint_sent(&mut conn, &peer.id.to_string(), ack_max)?;
        }

        info!("Sync completed with peer {}", peer.name);
        Ok(())
    }
}

impl Clone for SyncEngine {
    fn clone(&self) -> Self {
        Self {
            db_pool: self.db_pool.clone(),
            device_id: self.device_id,
            peers: self.peers.clone(),
            server_addr: self.server_addr.clone(),
            is_running: self.is_running.clone(),
        }
    }
}
