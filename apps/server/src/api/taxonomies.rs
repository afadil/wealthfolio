use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use tracing::debug;
use wealthfolio_core::health::{MigrationResult, MigrationStatus};
use wealthfolio_core::taxonomies::{
    AssetTaxonomyAssignment, Category, NewAssetTaxonomyAssignment, NewCategory, NewTaxonomy,
    Taxonomy, TaxonomyWithCategories,
};

/// Request body for move_category endpoint
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCategoryRequest {
    pub taxonomy_id: String,
    pub category_id: String,
    pub new_parent_id: Option<String>,
    pub position: i32,
}

/// Request body for import_taxonomy_json endpoint
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTaxonomyRequest {
    pub json_str: String,
}

// ============================================================================
// Taxonomy Endpoints
// ============================================================================

async fn get_taxonomies(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Taxonomy>>> {
    debug!("Fetching all taxonomies...");
    let taxonomies = state.taxonomy_service.get_taxonomies()?;
    Ok(Json(taxonomies))
}

async fn get_taxonomy(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<TaxonomyWithCategories>>> {
    debug!("Fetching taxonomy {}...", id);
    let taxonomy = state.taxonomy_service.get_taxonomy(&id)?;
    Ok(Json(taxonomy))
}

async fn create_taxonomy(
    State(state): State<Arc<AppState>>,
    Json(taxonomy): Json<NewTaxonomy>,
) -> ApiResult<Json<Taxonomy>> {
    debug!("Creating taxonomy {}...", taxonomy.name);
    let created = state.taxonomy_service.create_taxonomy(taxonomy).await?;
    Ok(Json(created))
}

async fn update_taxonomy(
    State(state): State<Arc<AppState>>,
    Json(taxonomy): Json<Taxonomy>,
) -> ApiResult<Json<Taxonomy>> {
    debug!("Updating taxonomy {}...", taxonomy.id);
    let updated = state.taxonomy_service.update_taxonomy(taxonomy).await?;
    Ok(Json(updated))
}

async fn delete_taxonomy(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Deleting taxonomy {}...", id);
    let _ = state.taxonomy_service.delete_taxonomy(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Category Endpoints
// ============================================================================

async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(category): Json<NewCategory>,
) -> ApiResult<Json<Category>> {
    debug!("Creating category {}...", category.name);
    let created = state.taxonomy_service.create_category(category).await?;
    Ok(Json(created))
}

async fn update_category(
    State(state): State<Arc<AppState>>,
    Json(category): Json<Category>,
) -> ApiResult<Json<Category>> {
    debug!("Updating category {}...", category.id);
    let updated = state.taxonomy_service.update_category(category).await?;
    Ok(Json(updated))
}

async fn delete_category(
    Path((taxonomy_id, category_id)): Path<(String, String)>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Deleting category {}...", category_id);
    let _ = state
        .taxonomy_service
        .delete_category(&taxonomy_id, &category_id)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn move_category(
    State(state): State<Arc<AppState>>,
    Json(request): Json<MoveCategoryRequest>,
) -> ApiResult<Json<Category>> {
    debug!(
        "Moving category {} to position {}...",
        request.category_id, request.position
    );
    let moved = state
        .taxonomy_service
        .move_category(
            &request.taxonomy_id,
            &request.category_id,
            request.new_parent_id,
            request.position,
        )
        .await?;
    Ok(Json(moved))
}

// ============================================================================
// Import/Export Endpoints
// ============================================================================

async fn import_taxonomy_json(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportTaxonomyRequest>,
) -> ApiResult<Json<Taxonomy>> {
    debug!("Importing taxonomy from JSON...");
    let taxonomy = state
        .taxonomy_service
        .import_taxonomy_json(&request.json_str)
        .await?;
    Ok(Json(taxonomy))
}

async fn export_taxonomy_json(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<String>> {
    debug!("Exporting taxonomy {} to JSON...", id);
    let json = state.taxonomy_service.export_taxonomy_json(&id)?;
    Ok(Json(json))
}

// ============================================================================
// Assignment Endpoints
// ============================================================================

async fn get_asset_taxonomy_assignments(
    Path(asset_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<AssetTaxonomyAssignment>>> {
    debug!("Fetching taxonomy assignments for asset {}...", asset_id);
    let assignments = state.taxonomy_service.get_asset_assignments(&asset_id)?;
    Ok(Json(assignments))
}

async fn assign_asset_to_category(
    State(state): State<Arc<AppState>>,
    Json(assignment): Json<NewAssetTaxonomyAssignment>,
) -> ApiResult<Json<AssetTaxonomyAssignment>> {
    debug!(
        "Assigning asset {} to category {}...",
        assignment.asset_id, assignment.category_id
    );
    let created = state
        .taxonomy_service
        .assign_asset_to_category(assignment)
        .await?;
    Ok(Json(created))
}

async fn remove_asset_taxonomy_assignment(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    debug!("Removing taxonomy assignment {}...", id);
    let _ = state.taxonomy_service.remove_asset_assignment(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Migration Endpoints
// ============================================================================

async fn get_migration_status(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<MigrationStatus>> {
    debug!("Checking migration status...");
    let status = wealthfolio_core::health::get_migration_status(
        state.asset_service.as_ref(),
        state.taxonomy_service.as_ref(),
    )?;
    Ok(Json(status))
}

async fn migrate_legacy_classifications(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<MigrationResult>> {
    debug!("Starting legacy classification migration...");
    let result = wealthfolio_core::health::migrate_legacy_classifications(
        state.asset_service.as_ref(),
        state.taxonomy_service.as_ref(),
    )
    .await?;
    Ok(Json(result))
}

// ============================================================================
// Router
// ============================================================================

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Taxonomy CRUD
        .route(
            "/taxonomies",
            get(get_taxonomies)
                .post(create_taxonomy)
                .put(update_taxonomy),
        )
        .route(
            "/taxonomies/{id}",
            get(get_taxonomy).delete(delete_taxonomy),
        )
        // Category operations
        .route(
            "/taxonomies/categories",
            post(create_category).put(update_category),
        )
        .route(
            "/taxonomies/{taxonomyId}/categories/{categoryId}",
            delete(delete_category),
        )
        .route("/taxonomies/categories/move", post(move_category))
        // Import/Export
        .route("/taxonomies/import", post(import_taxonomy_json))
        .route("/taxonomies/{id}/export", get(export_taxonomy_json))
        // Assignment operations
        .route(
            "/taxonomies/assignments/asset/{assetId}",
            get(get_asset_taxonomy_assignments),
        )
        .route("/taxonomies/assignments", post(assign_asset_to_category))
        .route(
            "/taxonomies/assignments/{id}",
            delete(remove_asset_taxonomy_assignment),
        )
        // Migration endpoints
        .route("/taxonomies/migration/status", get(get_migration_status))
        .route(
            "/taxonomies/migration/run",
            post(migrate_legacy_classifications),
        )
}
