// #[cfg(feature = "tls")]
// pub mod tls {
//     use anyhow::Context;
//     use futures::{SinkExt, StreamExt};
//     use std::{sync::Arc};
//     use tokio::net::{TcpListener, TcpStream};
//     use tokio_rustls::{TlsAcceptor, TlsConnector};
//     use tokio_tungstenite::{
//         accept_async_with_config,
//         connect_async_tls_with_config,
//         tungstenite::{protocol::Message as WsMsg, WebSocketConfig},
//         Connector,
//     };

//     use rustls::{
//         ClientConfig, ServerConfig,
//         pki_types::{CertificateDer, PrivateKeyDer, ServerName},
//     };
//     use rustls::server::{WebPkiClientVerifier, WebPkiClientVerifierBuilder};
//     use rustls::client::{ServerCertVerified, ServerCertVerifier};
//     use sha2::{Digest, Sha256};

//     use crate::db::DbPool;
//     use crate::sync::{store, types::WireMessage};

//     /* ---------------- Server config helpers ---------------- */

//     pub fn build_server_config(
//         my_cert_der: CertificateDer<'static>,
//         my_key_der: PrivateKeyDer<'static>,
//         trusted_client_certs: Vec<CertificateDer<'static>>, // self-signed peer certs you trust
//     ) -> anyhow::Result<Arc<ServerConfig>> {
//         // Build client verifier with trusted peers as root store
//         let mut roots = rustls::RootCertStore::empty();
//         for c in trusted_client_certs {
//             roots.add(c).context("add client root")?;
//         }
//         let client_verifier: Arc<dyn rustls::server::ClientCertVerifier> =
//             if roots.is_empty() {
//                 // No client auth yet (pairing phase)
//                 Arc::new(rustls::server::NoClientAuth::new())
//             } else {
//                 Arc::new(
//                     WebPkiClientVerifierBuilder::new(roots)
//                         .build()
//                         .context("client verifier")?,
//                 )
//             };

//         let cfg = rustls::ServerConfig::builder()
//             .with_client_cert_verifier(client_verifier)
//             .with_single_cert(vec![my_cert_der], my_key_der)
//             .context("server cert")?;

//         Ok(Arc::new(cfg))
//     }

//     /* ---------------- Client config with pinned server fingerprint ---------------- */

//     pub struct PinnedServerVerifier {
//         pub allowed_fingerprint_hex: String, // "AA:BB:..."
//     }

//     impl ServerCertVerifier for PinnedServerVerifier {
//         fn verify_server_cert(
//             &self,
//             end_entity: &rustls::pki_types::CertificateDer<'_>,
//             _intermediates: &[rustls::pki_types::CertificateDer<'_>],
//             _server_name: &ServerName<'_>,
//             _ocsp: &[u8],
//             _now: std::time::SystemTime,
//         ) -> Result<ServerCertVerified, rustls::Error> {
//             let mut hasher = Sha256::new();
//             hasher.update(end_entity.as_ref());
//             let fp = hasher.finalize();
//             let hex = fp.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(":");
//             if hex == self.allowed_fingerprint_hex {
//                 Ok(ServerCertVerified::assertion())
//             } else {
//                 Err(rustls::Error::General(format!("Server pin mismatch: got {hex}")))
//             }
//         }
//     }

//     pub fn build_client_config_with_pinning(
//         my_cert_der: CertificateDer<'static>,
//         my_key_der: PrivateKeyDer<'static>,
//         server_fingerprint_hex: String,
//     ) -> anyhow::Result<Arc<ClientConfig>> {
//         let verifier = Arc::new(PinnedServerVerifier { allowed_fingerprint_hex: server_fingerprint_hex });
//         let cfg = rustls::ClientConfig::builder()
//             .with_custom_certificate_verifier(verifier)
//             .with_client_auth_cert(vec![my_cert_der], my_key_der)
//             .context("client auth cert")?;
//         Ok(Arc::new(cfg))
//     }

//     /* ---------------- WSS server: mutual TLS + WS ---------------- */

//     pub async fn wss_start_server(
//         addr: &str,
//         db_pool: Arc<DbPool>,
//         device_id: uuid::Uuid,
//         tls_server_config: Arc<ServerConfig>,
//     ) -> anyhow::Result<()> {
//         let listener = TcpListener::bind(addr).await?;
//         let acceptor = TlsAcceptor::from(tls_server_config);

//         loop {
//             let (tcp, _) = listener.accept().await?;
//             let acceptor = acceptor.clone();
//             let pool = db_pool.clone();

//             tokio::spawn(async move {
//                 if let Err(e) = handle_tls_client(tcp, acceptor, pool, device_id).await {
//                     eprintln!("WSS server conn error: {e}");
//                 }
//             });
//         }
//     }

//     async fn handle_tls_client(
//         tcp: TcpStream,
//         acceptor: TlsAcceptor,
//         db_pool: Arc<DbPool>,
//         device_id: uuid::Uuid,
//     ) -> anyhow::Result<()> {
//         let tls = acceptor.accept(tcp).await?;
//         // Upgrade to WebSocket
//         let mut ws = accept_async_with_config(
//             tls,
//             Some(WebSocketConfig {
//                 max_send_queue: None,
//                 max_message_size: Some(8 * 1024 * 1024),
//                 max_frame_size: Some(2 * 1024 * 1024),
//                 accept_unmasked_frames: false,
//             }),
//         )
//         .await?;

//         let mut remote_id: Option<uuid::Uuid> = None;

//         while let Some(msg) = ws.next().await {
//             match msg? {
//                 WsMsg::Text(txt) => {
//                     match serde_json::from_str::<WireMessage>(&txt) {
//                         Ok(WireMessage::Hello { device_id: rid, .. }) => {
//                             remote_id = Some(rid);
//                             let reply = WireMessage::Hello {
//                                 message_id: uuid::Uuid::new_v4(),
//                                 device_id,
//                                 app: "wealthfolio".into(),
//                                 schema: 1,
//                                 capabilities: vec!["lww".into()],
//                             };
//                             ws.send(WsMsg::Text(serde_json::to_string(&reply)?)).await?;
//                         }
//                         Ok(WireMessage::Pull { since, limit, .. }) => {
//                             let mut conn = db_pool.get()?;
//                             store::enable_pragmas(&mut conn).ok();
//                             let max_v = store::max_version(&mut conn).unwrap_or(0);

//                             // Accounts
//                             let acc = store::get_accounts_since(&mut conn, since, limit).unwrap_or_default();
//                             ws.send(WsMsg::Text(serde_json::to_string(
//                                 &WireMessage::AccountsBatch {
//                                     message_id: uuid::Uuid::new_v4(),
//                                     rows: acc,
//                                     max_version: max_v,
//                                     done: false,
//                                 },
//                             )?)).await?;

//                             // Assets
//                             let assets = store::get_assets_since(&mut conn, since, limit).unwrap_or_default();
//                             ws.send(WsMsg::Text(serde_json::to_string(
//                                 &WireMessage::AssetsBatch {
//                                     message_id: uuid::Uuid::new_v4(),
//                                     rows: assets,
//                                     max_version: max_v,
//                                     done: false,
//                                 },
//                             )?)).await?;

//                             // Activities
//                             let acts = store::get_activities_since(&mut conn, since, limit).unwrap_or_default();
//                             ws.send(WsMsg::Text(serde_json::to_string(
//                                 &WireMessage::ActivitiesBatch {
//                                     message_id: uuid::Uuid::new_v4(),
//                                     rows: acts,
//                                     max_version: max_v,
//                                     done: true,
//                                 },
//                             )?)).await?;
//                         }
//                         Ok(WireMessage::AccountsBatch { rows, max_version, .. }) => {
//                             if let (Some(pid), Ok(mut conn)) = (remote_id, db_pool.get()) {
//                                 let _ = store::apply_accounts(&mut conn, &rows);
//                                 if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
//                                     let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
//                                     ws.send(WsMsg::Text(serde_json::to_string(
//                                         &WireMessage::Ack { message_id: uuid::Uuid::new_v4(), applied_through: m.max(max_version) },
//                                     )?)).await?;
//                                 }
//                             }
//                         }
//                         Ok(WireMessage::AssetsBatch { rows, max_version, .. }) => {
//                             if let (Some(pid), Ok(mut conn)) = (remote_id, db_pool.get()) {
//                                 let _ = store::apply_assets(&mut conn, &rows);
//                                 if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
//                                     let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
//                                     ws.send(WsMsg::Text(serde_json::to_string(
//                                         &WireMessage::Ack { message_id: uuid::Uuid::new_v4(), applied_through: m.max(max_version) },
//                                     )?)).await?;
//                                 }
//                             }
//                         }
//                         Ok(WireMessage::ActivitiesBatch { rows, max_version, .. }) => {
//                             if let (Some(pid), Ok(mut conn)) = (remote_id, db_pool.get()) {
//                                 let _ = store::apply_activities(&mut conn, &rows);
//                                 if let Some(m) = rows.iter().map(|r| r.updated_version).max() {
//                                     let _ = store::set_checkpoint_received(&mut conn, &pid.to_string(), m);
//                                     ws.send(WsMsg::Text(serde_json::to_string(
//                                         &WireMessage::Ack { message_id: uuid::Uuid::new_v4(), applied_through: m.max(max_version) },
//                                     )?)).await?;
//                                 }
//                             }
//                         }
//                         Ok(WireMessage::Ack { applied_through, .. }) => {
//                             if let (Some(pid), Ok(mut conn)) = (remote_id, db_pool.get()) {
//                                 let _ = store::set_checkpoint_sent(&mut conn, &pid.to_string(), applied_through);
//                             }
//                         }
//                         Err(e) => { eprintln!("WSS server parse error: {e}"); }
//                     }
//                 }
//                 WsMsg::Close(_) => break,
//                 _ => {}
//             }
//         }
//         Ok(())
//     }

//     /* ---------------- WSS client: pin server + present client cert ---------------- */

//     pub async fn connect_to_peer_wss(
//         url: &str,
//         tls_client_config: Arc<ClientConfig>,
//     ) -> anyhow::Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>> {
//         let connector = Connector::Rustls(tls_client_config);
//         let (ws_stream, _) = connect_async_tls_with_config(url, Some(connector), Some(WebSocketConfig::default())).await?;
//         Ok(ws_stream)
//     }

//     /* ---------------- Utilities: fingerprint ---------------- */
//     pub fn sha256_fingerprint_der(cert: &CertificateDer<'_>) -> String {
//         let mut h = Sha256::new();
//         h.update(cert.as_ref());
//         let fp = h.finalize();
//         fp.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(":")
//     }
// }
