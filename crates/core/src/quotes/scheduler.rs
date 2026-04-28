use std::sync::Arc;
use std::time::Duration;

use log::{error, info};

use super::service::QuoteServiceTrait;
use super::sync_state::SyncMode;

/// Runs periodic market data sync on a fixed interval.
///
/// Sleeps for `initial_delay`, then loops: sync → sleep `interval`.
/// Never panics — errors are logged and the loop continues.
pub async fn run_periodic_sync(
    quote_service: Arc<dyn QuoteServiceTrait>,
    initial_delay: Duration,
    interval: Duration,
) {
    tokio::time::sleep(initial_delay).await;
    info!(
        "Periodic market data sync started (interval: {}h)",
        interval.as_secs() / 3600
    );

    loop {
        info!("Periodic market data sync: starting incremental sync");
        match quote_service.sync(SyncMode::Incremental, None).await {
            Ok(result) => {
                info!(
                    "Periodic market data sync completed: {} synced, {} skipped, {} failed",
                    result.synced, result.skipped, result.failed
                );
            }
            Err(e) => {
                error!("Periodic market data sync failed: {}", e);
            }
        }
        tokio::time::sleep(interval).await;
    }
}
