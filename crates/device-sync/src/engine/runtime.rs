use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use super::{
    run_background_loop, run_sync_cycle, CredentialStore, OutboxStore, ReplayStore,
    SyncCycleResult, SyncTransport,
};

#[derive(Debug)]
pub struct DeviceSyncRuntimeState {
    cycle_mutex: Mutex<()>,
    background_task: Mutex<Option<JoinHandle<()>>>,
    pub snapshot_upload_cancelled: AtomicBool,
}

impl DeviceSyncRuntimeState {
    pub fn new() -> Self {
        Self {
            cycle_mutex: Mutex::new(()),
            background_task: Mutex::new(None),
            snapshot_upload_cancelled: AtomicBool::new(false),
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
}
