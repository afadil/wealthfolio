use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use super::{
    run_background_loop, run_sync_cycle, CredentialStore, OutboxStore, ReplayStore,
    SyncCycleResult, SyncTransport,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Flow Coordinator Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverwriteTableInfo {
    pub table: String,
    pub rows: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverwriteInfo {
    pub local_rows: i64,
    pub non_empty_tables: Vec<OverwriteTableInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum PairingFlowPhase {
    OverwriteRequired { info: OverwriteInfo },
    Syncing { detail: String },
    Success,
    Error { message: String },
}

#[derive(Debug)]
pub struct PairingFlowState {
    pub phase: PairingFlowPhase,
    pub pairing_id: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingFlowResponse {
    pub flow_id: String,
    pub phase: PairingFlowPhase,
}

// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct DeviceSyncRuntimeState {
    cycle_mutex: Mutex<()>,
    background_task: Mutex<Option<JoinHandle<()>>>,
    pub snapshot_upload_cancelled: AtomicBool,
    pairing_flows: std::sync::Mutex<HashMap<String, PairingFlowState>>,
}

impl DeviceSyncRuntimeState {
    pub fn new() -> Self {
        Self {
            cycle_mutex: Mutex::new(()),
            background_task: Mutex::new(None),
            snapshot_upload_cancelled: AtomicBool::new(false),
            pairing_flows: std::sync::Mutex::new(HashMap::new()),
        }
    }
}

impl Default for DeviceSyncRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl DeviceSyncRuntimeState {
    pub async fn run_cycle<P>(&self, ports: &P) -> Result<SyncCycleResult, String>
    where
        P: OutboxStore + ReplayStore + SyncTransport + CredentialStore + Send + Sync,
    {
        let _cycle_guard = self.cycle_mutex.lock().await;
        run_sync_cycle(ports).await
    }

    pub async fn ensure_background_started<P>(&self, ports: Arc<P>)
    where
        P: OutboxStore + ReplayStore + SyncTransport + CredentialStore + Send + Sync + 'static,
    {
        let mut guard = self.background_task.lock().await;
        if let Some(handle) = guard.as_ref() {
            if !handle.is_finished() {
                return;
            }
            guard.take();
        }

        let handle = tokio::spawn(async move {
            run_background_loop(ports).await;
        });
        *guard = Some(handle);
    }

    pub async fn ensure_background_stopped(&self) {
        let mut guard = self.background_task.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }

    pub async fn is_background_running(&self) -> bool {
        let guard = self.background_task.lock().await;
        guard.as_ref().is_some_and(|handle| !handle.is_finished())
    }

    // ─── Pairing flow store ──────────────────────────────────────────────

    pub fn create_flow(&self, pairing_id: String, phase: PairingFlowPhase) -> String {
        let flow_id = uuid::Uuid::new_v4().to_string();
        let mut flows = self.pairing_flows.lock().unwrap();
        flows.insert(flow_id.clone(), PairingFlowState { phase, pairing_id });
        flow_id
    }

    pub fn get_flow_phase(&self, flow_id: &str) -> Option<PairingFlowPhase> {
        let flows = self.pairing_flows.lock().unwrap();
        flows.get(flow_id).map(|s| s.phase.clone())
    }

    pub fn get_flow_pairing_id(&self, flow_id: &str) -> Option<String> {
        let flows = self.pairing_flows.lock().unwrap();
        flows.get(flow_id).map(|s| s.pairing_id.clone())
    }

    pub fn set_flow_phase(&self, flow_id: &str, phase: PairingFlowPhase) {
        let mut flows = self.pairing_flows.lock().unwrap();
        if let Some(state) = flows.get_mut(flow_id) {
            state.phase = phase;
        }
    }

    pub fn remove_flow(&self, flow_id: &str) {
        let mut flows = self.pairing_flows.lock().unwrap();
        flows.remove(flow_id);
    }
}
