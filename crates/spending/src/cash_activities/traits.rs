use anyhow::Result;
use async_trait::async_trait;

use super::model::{CashActivity, CashActivitySearchRequest, CashActivitySearchResponse};
use super::service::CashActivityService;

/// Read-only surface of `CashActivityService` consumed by agent tools.
/// Mirrors the inherent method signatures exactly; extend (don't change)
/// when write tools need more of the service.
#[async_trait]
pub trait CashActivityServiceTrait: Send + Sync {
    async fn search(&self, req: CashActivitySearchRequest) -> Result<CashActivitySearchResponse>;
    async fn get_by_activity_ids(&self, activity_ids: &[String]) -> Result<Vec<CashActivity>>;
}

#[async_trait]
impl CashActivityServiceTrait for CashActivityService {
    async fn search(&self, req: CashActivitySearchRequest) -> Result<CashActivitySearchResponse> {
        // `None`: the agent surface reads rows, not a headline figure, so it has
        // no base currency to convert into and skips FX entirely — which also
        // makes the timezone moot, since nothing is dated for a rate lookup.
        CashActivityService::search(self, req, None, "").await
    }

    async fn get_by_activity_ids(&self, activity_ids: &[String]) -> Result<Vec<CashActivity>> {
        CashActivityService::get_by_activity_ids(self, activity_ids).await
    }
}
