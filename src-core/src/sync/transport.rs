// sync/transport.rs
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{SinkExt};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::{
    connect_async,
    tungstenite::protocol::Message as TungsteniteMessage,
    MaybeTlsStream, WebSocketStream,
};

use crate::db::DbPool;
use crate::sync::store;
use crate::sync::types::WireMessage;

#[derive(Clone)]
pub struct ServerState {
    pub db_pool: Arc<DbPool>,
    pub device_id: uuid::Uuid,
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<ServerState>) {
    let mut remote_id: Option<uuid::Uuid> = None;

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(txt) => {
                match serde_json::from_str::<WireMessage>(&txt) {
                    // Handshake
                    Ok(WireMessage::Hello { device_id, .. }) => {
                        remote_id = Some(device_id);
                        let reply = WireMessage::Hello {
                            message_id: uuid::Uuid::new_v4(),
                            device_id: state.device_id,
                            app: "wealthfolio".to_string(),
                            schema: 1,
                            capabilities: vec!["lww".to_string()],
                        };
                        if let Err(e) = socket
                            .send(Message::Text(serde_json::to_string(&reply).unwrap().into()))
                            .await
                        {
                            eprintln!("WS server: failed to send Hello reply: {e}");
                            break;
                        }
                    }

                    // Peer pulls: send Accounts -> Assets -> Activities (done=true on last)
                    Ok(WireMessage::Pull { since, limit, .. }) => {
                        if let Ok(mut conn) = state.db_pool.get() {
                            let _ = store::enable_pragmas(&mut conn);
                            let max_v = store::max_version(&mut conn).unwrap_or(0);

                            // Accounts
                            let acc = store::get_accounts_since(&mut conn, since, limit)
                                .unwrap_or_default();
                            let batch = WireMessage::AccountsBatch {
                                message_id: uuid::Uuid::new_v4(),
                                rows: acc,
                                max_version: max_v,
                                done: false,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&batch).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send accounts batch failed: {e}");
                                break;
                            }

                            // Assets
                            let assets =
                                store::get_assets_since(&mut conn, since, limit).unwrap_or_default();
                            let batch = WireMessage::AssetsBatch {
                                message_id: uuid::Uuid::new_v4(),
                                rows: assets,
                                max_version: max_v,
                                done: false,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&batch).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send assets batch failed: {e}");
                                break;
                            }

                            // Activities
                            let acts =
                                store::get_activities_since(&mut conn, since, limit).unwrap_or_default();
                            let batch = WireMessage::ActivitiesBatch {
                                message_id: uuid::Uuid::new_v4(),
                                rows: acts,
                                max_version: max_v,
                                done: true,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&batch).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send activities batch failed: {e}");
                                break;
                            }
                        }
                    }

                    // Inbound batches from the client (we act as receiver): apply + ACK
                    Ok(WireMessage::AccountsBatch { rows, .. }) => {
                        if let (Some(pid), Ok(mut conn)) = (remote_id, state.db_pool.get()) {
                            let _ = store::apply_accounts(&mut conn, &rows);
                            // Advance last_version_received using applied rows only
                            let m = rows.iter().map(|r| r.updated_version).max().unwrap_or(0);
                            if m > 0 {
                                let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
                            }
                            // ACK with applied_through = max applied this batch (safe; no over-advance)
                            let ack = WireMessage::Ack {
                                message_id: uuid::Uuid::new_v4(),
                                applied_through: m,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&ack).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send accounts ack failed: {e}");
                                break;
                            }
                        }
                    }

                    Ok(WireMessage::AssetsBatch { rows, .. }) => {
                        if let (Some(pid), Ok(mut conn)) = (remote_id, state.db_pool.get()) {
                            let _ = store::apply_assets(&mut conn, &rows);
                            let m = rows.iter().map(|r| r.updated_version).max().unwrap_or(0);
                            if m > 0 {
                                let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
                            }
                            let ack = WireMessage::Ack {
                                message_id: uuid::Uuid::new_v4(),
                                applied_through: m,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&ack).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send assets ack failed: {e}");
                                break;
                            }
                        }
                    }

                    Ok(WireMessage::ActivitiesBatch { rows, .. }) => {
                        if let (Some(pid), Ok(mut conn)) = (remote_id, state.db_pool.get()) {
                            let _ = store::apply_activities(&mut conn, &rows);
                            let m = rows.iter().map(|r| r.updated_version).max().unwrap_or(0);
                            if m > 0 {
                                let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
                            }
                            let ack = WireMessage::Ack {
                                message_id: uuid::Uuid::new_v4(),
                                applied_through: m,
                            };
                            if let Err(e) = socket
                                .send(Message::Text(serde_json::to_string(&ack).unwrap().into()))
                                .await
                            {
                                eprintln!("WS server: send activities ack failed: {e}");
                                break;
                            }
                        }
                    }

                    // Client informs us we can advance our last_version_sent for this peer
                    Ok(WireMessage::Ack { applied_through, .. }) => {
                        if let (Some(pid), Ok(mut conn)) = (remote_id, state.db_pool.get()) {
                            let _ = store::set_checkpoint_sent(
                                &mut conn,
                                &pid.to_string(),
                                applied_through,
                            );
                        }
                    }

                    Err(e) => {
                        eprintln!("WS server: JSON parse error: {e}");
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}

pub async fn start_server(
    addr: &str,
    db_pool: Arc<DbPool>,
    device_id: uuid::Uuid,
) -> anyhow::Result<()> {
    let state = Arc::new(ServerState { db_pool, device_id });
    let app = Router::new()
        .route("/ws", get(websocket_handler))
        .with_state(state);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// Client (ws:// for now; swap to wss:// in transport_tls.rs for production)
pub async fn connect_to_peer(
    addr: &str,
) -> Result<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, anyhow::Error> {
    let (ws_stream, _) = connect_async(addr).await?;
    Ok(ws_stream)
}

pub async fn send_message(
    ws_stream: &mut WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
    msg: &WireMessage,
) -> Result<(), anyhow::Error> {
    let json = serde_json::to_string(msg)?;
    ws_stream.send(TungsteniteMessage::Text(json.into())).await?;
    Ok(())
}
