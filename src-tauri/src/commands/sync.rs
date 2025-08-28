use tauri::State;
use crate::SyncHandles;

#[tauri::command]
async fn sync_now(state: State<'_, SyncHandles>, peer_id: String) -> Result<(), String> {
    let id = uuid::Uuid::parse_str(&peer_id).map_err(|e| e.to_string())?;
    state.engine.sync_with_peer(id).await.map_err(|e| e.to_string())
}
