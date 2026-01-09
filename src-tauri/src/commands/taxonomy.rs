use std::collections::HashMap;
use std::sync::Arc;

use log::{debug, warn};
use serde::{Deserialize, Serialize};
use tauri::State;
use wealthfolio_core::taxonomies::{
    AssetTaxonomyAssignment, Category, NewAssetTaxonomyAssignment, NewCategory, NewTaxonomy,
    Taxonomy, TaxonomyWithCategories,
};

use crate::context::ServiceContext;

// ============================================================================
// Migration Types
// ============================================================================

/// Status of legacy classification migration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStatus {
    /// Whether migration is needed (assets with legacy data exist)
    pub needed: bool,
    /// Number of assets with legacy sector/country data that haven't been migrated
    pub assets_with_legacy_data: i32,
    /// Number of assets already migrated to taxonomy system
    pub assets_already_migrated: i32,
}

/// Result of legacy classification migration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    /// Number of sector assignments created
    pub sectors_migrated: i32,
    /// Number of country/region assignments created
    pub countries_migrated: i32,
    /// Number of assets processed
    pub assets_processed: i32,
    /// Errors encountered during migration
    pub errors: Vec<String>,
}

/// Legacy sector data from profile JSON
#[derive(Debug, Clone, Deserialize)]
struct LegacySector {
    name: String,
    weight: f64,
}

/// Legacy country data from profile JSON
#[derive(Debug, Clone, Deserialize)]
struct LegacyCountry {
    name: String,
    weight: f64,
}

#[tauri::command]
pub async fn get_taxonomies(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Taxonomy>, String> {
    debug!("Fetching all taxonomies...");
    state
        .taxonomy_service()
        .get_taxonomies()
        .map_err(|e| format!("Failed to load taxonomies: {}", e))
}

#[tauri::command]
pub async fn get_taxonomy(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<TaxonomyWithCategories>, String> {
    debug!("Fetching taxonomy {}...", id);
    state
        .taxonomy_service()
        .get_taxonomy(&id)
        .map_err(|e| format!("Failed to load taxonomy: {}", e))
}

#[tauri::command]
pub async fn create_taxonomy(
    taxonomy: NewTaxonomy,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Taxonomy, String> {
    debug!("Creating taxonomy {}...", taxonomy.name);
    state
        .taxonomy_service()
        .create_taxonomy(taxonomy)
        .await
        .map_err(|e| format!("Failed to create taxonomy: {}", e))
}

#[tauri::command]
pub async fn update_taxonomy(
    taxonomy: Taxonomy,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Taxonomy, String> {
    debug!("Updating taxonomy {}...", taxonomy.id);
    state
        .taxonomy_service()
        .update_taxonomy(taxonomy)
        .await
        .map_err(|e| format!("Failed to update taxonomy: {}", e))
}

#[tauri::command]
pub async fn delete_taxonomy(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting taxonomy {}...", id);
    state
        .taxonomy_service()
        .delete_taxonomy(&id)
        .await
        .map_err(|e| format!("Failed to delete taxonomy: {}", e))
}

#[tauri::command]
pub async fn create_category(
    category: NewCategory,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Category, String> {
    debug!("Creating category {}...", category.name);
    state
        .taxonomy_service()
        .create_category(category)
        .await
        .map_err(|e| format!("Failed to create category: {}", e))
}

#[tauri::command]
pub async fn update_category(
    category: Category,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Category, String> {
    debug!("Updating category {}...", category.id);
    state
        .taxonomy_service()
        .update_category(category)
        .await
        .map_err(|e| format!("Failed to update category: {}", e))
}

#[tauri::command]
pub async fn delete_category(
    taxonomy_id: String,
    category_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting category {}...", category_id);
    state
        .taxonomy_service()
        .delete_category(&taxonomy_id, &category_id)
        .await
        .map_err(|e| format!("Failed to delete category: {}", e))
}

#[tauri::command]
pub async fn move_category(
    taxonomy_id: String,
    category_id: String,
    new_parent_id: Option<String>,
    position: i32,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Category, String> {
    debug!("Moving category {} to position {}...", category_id, position);
    state
        .taxonomy_service()
        .move_category(&taxonomy_id, &category_id, new_parent_id, position)
        .await
        .map_err(|e| format!("Failed to move category: {}", e))
}

#[tauri::command]
pub async fn import_taxonomy_json(
    json_str: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Taxonomy, String> {
    debug!("Importing taxonomy from JSON...");
    state
        .taxonomy_service()
        .import_taxonomy_json(&json_str)
        .await
        .map_err(|e| format!("Failed to import taxonomy: {}", e))
}

#[tauri::command]
pub async fn export_taxonomy_json(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<String, String> {
    debug!("Exporting taxonomy {} to JSON...", id);
    state
        .taxonomy_service()
        .export_taxonomy_json(&id)
        .map_err(|e| format!("Failed to export taxonomy: {}", e))
}

#[tauri::command]
pub async fn get_asset_taxonomy_assignments(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AssetTaxonomyAssignment>, String> {
    debug!("Fetching taxonomy assignments for asset {}...", asset_id);
    state
        .taxonomy_service()
        .get_asset_assignments(&asset_id)
        .map_err(|e| format!("Failed to load assignments: {}", e))
}

#[tauri::command]
pub async fn assign_asset_to_category(
    assignment: NewAssetTaxonomyAssignment,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AssetTaxonomyAssignment, String> {
    debug!(
        "Assigning asset {} to category {}...",
        assignment.asset_id, assignment.category_id
    );
    state
        .taxonomy_service()
        .assign_asset_to_category(assignment)
        .await
        .map_err(|e| format!("Failed to create assignment: {}", e))
}

#[tauri::command]
pub async fn remove_asset_taxonomy_assignment(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Removing taxonomy assignment {}...", id);
    state
        .taxonomy_service()
        .remove_asset_assignment(&id)
        .await
        .map_err(|e| format!("Failed to remove assignment: {}", e))
}

// ============================================================================
// Legacy Classification Migration Commands
// ============================================================================

/// Check if legacy classification migration is needed
#[tauri::command]
pub async fn get_migration_status(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<MigrationStatus, String> {
    debug!("Checking migration status...");

    // Get all assets
    let assets = state
        .asset_service()
        .get_assets()
        .map_err(|e| format!("Failed to load assets: {}", e))?;

    // Get GICS and Regions taxonomy categories
    let gics_taxonomy = state
        .taxonomy_service()
        .get_taxonomy("industries_gics")
        .map_err(|e| format!("Failed to load GICS taxonomy: {}", e))?;

    let regions_taxonomy = state
        .taxonomy_service()
        .get_taxonomy("regions")
        .map_err(|e| format!("Failed to load regions taxonomy: {}", e))?;

    let mut assets_with_legacy_data = 0;
    let mut assets_already_migrated = 0;

    for asset in &assets {
        // Check if asset has legacy sector/country data in metadata.legacy
        let legacy = asset
            .metadata
            .as_ref()
            .and_then(|m| m.get("legacy"));

        let has_legacy_sectors = legacy
            .and_then(|l| l.get("sectors"))
            .map(|s| !s.is_null() && s.as_str().map(|str| !str.is_empty()).unwrap_or(true))
            .unwrap_or(false);

        let has_legacy_countries = legacy
            .and_then(|l| l.get("countries"))
            .map(|c| !c.is_null() && c.as_str().map(|str| !str.is_empty()).unwrap_or(true))
            .unwrap_or(false);

        if !has_legacy_sectors && !has_legacy_countries {
            continue;
        }

        // Check if asset has taxonomy assignments for GICS or regions
        let assignments = state
            .taxonomy_service()
            .get_asset_assignments(&asset.id)
            .map_err(|e| format!("Failed to load assignments: {}", e))?;

        let has_gics_assignment = gics_taxonomy.as_ref().map_or(false, |t| {
            assignments.iter().any(|a| a.taxonomy_id == t.taxonomy.id)
        });

        let has_regions_assignment = regions_taxonomy.as_ref().map_or(false, |t| {
            assignments.iter().any(|a| a.taxonomy_id == t.taxonomy.id)
        });

        // If has legacy data but no corresponding taxonomy assignments, needs migration
        if (has_legacy_sectors && !has_gics_assignment)
            || (has_legacy_countries && !has_regions_assignment)
        {
            assets_with_legacy_data += 1;
        } else if has_gics_assignment || has_regions_assignment {
            assets_already_migrated += 1;
        }
    }

    Ok(MigrationStatus {
        needed: assets_with_legacy_data > 0,
        assets_with_legacy_data,
        assets_already_migrated,
    })
}

/// Migrate legacy sector and country classifications to taxonomy system
#[tauri::command]
pub async fn migrate_legacy_classifications(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<MigrationResult, String> {
    debug!("Starting legacy classification migration...");

    let mut result = MigrationResult {
        sectors_migrated: 0,
        countries_migrated: 0,
        assets_processed: 0,
        errors: Vec::new(),
    };

    // Build sector name mapping (Yahoo Finance -> GICS category ID)
    let sector_mapping = build_sector_mapping();

    // Build country name mapping (country name/alias -> category ID)
    let country_mapping = build_country_mapping();

    // Get all assets
    let assets = state
        .asset_service()
        .get_assets()
        .map_err(|e| format!("Failed to load assets: {}", e))?;

    // Get GICS and Regions taxonomies
    let gics_taxonomy = state
        .taxonomy_service()
        .get_taxonomy("industries_gics")
        .map_err(|e| format!("Failed to load GICS taxonomy: {}", e))?;

    let regions_taxonomy = state
        .taxonomy_service()
        .get_taxonomy("regions")
        .map_err(|e| format!("Failed to load regions taxonomy: {}", e))?;

    let gics_categories: HashMap<String, Category> = gics_taxonomy
        .as_ref()
        .map(|t| {
            t.categories
                .iter()
                .map(|c| (c.id.clone(), c.clone()))
                .collect()
        })
        .unwrap_or_default();

    let regions_categories: HashMap<String, Category> = regions_taxonomy
        .as_ref()
        .map(|t| {
            t.categories
                .iter()
                .map(|c| (c.id.clone(), c.clone()))
                .collect()
        })
        .unwrap_or_default();

    for asset in &assets {
        // Legacy data stored in metadata.legacy
        let legacy = match asset.metadata.as_ref().and_then(|m| m.get("legacy")) {
            Some(l) => l,
            None => continue,
        };

        // Check existing assignments to avoid duplicates
        let existing_assignments = state
            .taxonomy_service()
            .get_asset_assignments(&asset.id)
            .unwrap_or_default();

        let has_gics = existing_assignments
            .iter()
            .any(|a| a.taxonomy_id == "industries_gics");
        let has_regions = existing_assignments
            .iter()
            .any(|a| a.taxonomy_id == "regions");

        let mut processed = false;

        // Migrate sectors to GICS taxonomy
        if !has_gics {
            if let Some(sectors_value) = legacy.get("sectors") {
                match parse_legacy_sectors(sectors_value) {
                    Ok(sectors) => {
                        for sector in sectors {
                            if let Some(category_id) =
                                find_gics_category(&sector.name, &sector_mapping)
                            {
                                if gics_categories.contains_key(&category_id) {
                                    // Convert weight from decimal (0.0-1.0) to basis points (0-10000)
                                    let weight = (sector.weight * 10000.0).round() as i32;
                                    let weight = weight.clamp(0, 10000);

                                    let assignment = NewAssetTaxonomyAssignment {
                                        id: None,
                                        asset_id: asset.id.clone(),
                                        taxonomy_id: "industries_gics".to_string(),
                                        category_id: category_id.clone(),
                                        weight,
                                        source: "migrated".to_string(),
                                    };

                                    match state
                                        .taxonomy_service()
                                        .assign_asset_to_category(assignment)
                                        .await
                                    {
                                        Ok(_) => {
                                            result.sectors_migrated += 1;
                                            processed = true;
                                        }
                                        Err(e) => {
                                            result.errors.push(format!(
                                                "Failed to assign sector '{}' to asset '{}': {}",
                                                sector.name, asset.id, e
                                            ));
                                        }
                                    }
                                } else {
                                    warn!(
                                        "GICS category '{}' not found for sector '{}'",
                                        category_id, sector.name
                                    );
                                }
                            } else {
                                warn!("No GICS mapping found for sector: {}", sector.name);
                            }
                        }
                    }
                    Err(e) => {
                        result.errors.push(format!(
                            "Failed to parse sectors for asset '{}': {}",
                            asset.id, e
                        ));
                    }
                }
            }
        }

        // Migrate countries to Regions taxonomy
        if !has_regions {
            if let Some(countries_value) = legacy.get("countries") {
                match parse_legacy_countries(countries_value) {
                    Ok(countries) => {
                        for country in countries {
                            if let Some(category_id) =
                                find_country_category(&country.name, &country_mapping)
                            {
                                if regions_categories.contains_key(&category_id) {
                                    // Convert weight from decimal (0.0-1.0) to basis points (0-10000)
                                    let weight = (country.weight * 10000.0).round() as i32;
                                    let weight = weight.clamp(0, 10000);

                                    let assignment = NewAssetTaxonomyAssignment {
                                        id: None,
                                        asset_id: asset.id.clone(),
                                        taxonomy_id: "regions".to_string(),
                                        category_id: category_id.clone(),
                                        weight,
                                        source: "migrated".to_string(),
                                    };

                                    match state
                                        .taxonomy_service()
                                        .assign_asset_to_category(assignment)
                                        .await
                                    {
                                        Ok(_) => {
                                            result.countries_migrated += 1;
                                            processed = true;
                                        }
                                        Err(e) => {
                                            result.errors.push(format!(
                                                "Failed to assign country '{}' to asset '{}': {}",
                                                country.name, asset.id, e
                                            ));
                                        }
                                    }
                                } else {
                                    warn!(
                                        "Regions category '{}' not found for country '{}'",
                                        category_id, country.name
                                    );
                                }
                            } else {
                                warn!("No regions mapping found for country: {}", country.name);
                            }
                        }
                    }
                    Err(e) => {
                        result.errors.push(format!(
                            "Failed to parse countries for asset '{}': {}",
                            asset.id, e
                        ));
                    }
                }
            }
        }

        if processed {
            result.assets_processed += 1;
        }
    }

    debug!(
        "Migration complete: {} assets, {} sectors, {} countries, {} errors",
        result.assets_processed,
        result.sectors_migrated,
        result.countries_migrated,
        result.errors.len()
    );

    Ok(result)
}

// ============================================================================
// Helper Functions for Migration
// ============================================================================

/// Build mapping from Yahoo Finance sector names to GICS category IDs
fn build_sector_mapping() -> HashMap<String, String> {
    let mut mapping = HashMap::new();

    // Yahoo Finance sector names -> GICS sector IDs
    // Energy sector (GICS 10)
    mapping.insert("energy".to_string(), "10".to_string());

    // Materials sector (GICS 15)
    mapping.insert("basic materials".to_string(), "15".to_string());
    mapping.insert("materials".to_string(), "15".to_string());

    // Industrials sector (GICS 20)
    mapping.insert("industrials".to_string(), "20".to_string());

    // Consumer Discretionary sector (GICS 25)
    mapping.insert("consumer cyclical".to_string(), "25".to_string());
    mapping.insert("consumer discretionary".to_string(), "25".to_string());

    // Consumer Staples sector (GICS 30)
    mapping.insert("consumer defensive".to_string(), "30".to_string());
    mapping.insert("consumer staples".to_string(), "30".to_string());

    // Health Care sector (GICS 35)
    mapping.insert("healthcare".to_string(), "35".to_string());
    mapping.insert("health care".to_string(), "35".to_string());

    // Financials sector (GICS 40)
    mapping.insert("financial services".to_string(), "40".to_string());
    mapping.insert("financial".to_string(), "40".to_string());
    mapping.insert("financials".to_string(), "40".to_string());

    // Information Technology sector (GICS 45)
    mapping.insert("technology".to_string(), "45".to_string());
    mapping.insert("information technology".to_string(), "45".to_string());

    // Communication Services sector (GICS 50)
    mapping.insert("communication services".to_string(), "50".to_string());
    mapping.insert("telecommunications".to_string(), "50".to_string());

    // Utilities sector (GICS 55)
    mapping.insert("utilities".to_string(), "55".to_string());

    // Real Estate sector (GICS 60)
    mapping.insert("real estate".to_string(), "60".to_string());

    mapping
}

/// Build mapping from country names to regions taxonomy category IDs
fn build_country_mapping() -> HashMap<String, String> {
    let mut mapping = HashMap::new();

    // North America
    mapping.insert("united states".to_string(), "country_US".to_string());
    mapping.insert("usa".to_string(), "country_US".to_string());
    mapping.insert("us".to_string(), "country_US".to_string());
    mapping.insert("u.s.".to_string(), "country_US".to_string());
    mapping.insert("u.s.a.".to_string(), "country_US".to_string());
    mapping.insert("america".to_string(), "country_US".to_string());
    mapping.insert("canada".to_string(), "country_CA".to_string());
    mapping.insert("mexico".to_string(), "country_MX".to_string());
    mapping.insert("bermuda".to_string(), "country_BM".to_string());

    // Europe - Western
    mapping.insert("united kingdom".to_string(), "country_GB".to_string());
    mapping.insert("uk".to_string(), "country_GB".to_string());
    mapping.insert("great britain".to_string(), "country_GB".to_string());
    mapping.insert("britain".to_string(), "country_GB".to_string());
    mapping.insert("england".to_string(), "country_GB".to_string());
    mapping.insert("germany".to_string(), "country_DE".to_string());
    mapping.insert("france".to_string(), "country_FR".to_string());
    mapping.insert("netherlands".to_string(), "country_NL".to_string());
    mapping.insert("holland".to_string(), "country_NL".to_string());
    mapping.insert("switzerland".to_string(), "country_CH".to_string());
    mapping.insert("belgium".to_string(), "country_BE".to_string());
    mapping.insert("austria".to_string(), "country_AT".to_string());
    mapping.insert("luxembourg".to_string(), "country_LU".to_string());
    mapping.insert("ireland".to_string(), "country_IE".to_string());

    // Europe - Northern
    mapping.insert("sweden".to_string(), "country_SE".to_string());
    mapping.insert("norway".to_string(), "country_NO".to_string());
    mapping.insert("denmark".to_string(), "country_DK".to_string());
    mapping.insert("finland".to_string(), "country_FI".to_string());
    mapping.insert("iceland".to_string(), "country_IS".to_string());

    // Europe - Southern
    mapping.insert("spain".to_string(), "country_ES".to_string());
    mapping.insert("italy".to_string(), "country_IT".to_string());
    mapping.insert("portugal".to_string(), "country_PT".to_string());
    mapping.insert("greece".to_string(), "country_GR".to_string());

    // Europe - Eastern
    mapping.insert("poland".to_string(), "country_PL".to_string());
    mapping.insert("russia".to_string(), "country_RU".to_string());
    mapping.insert("czech republic".to_string(), "country_CZ".to_string());
    mapping.insert("czechia".to_string(), "country_CZ".to_string());
    mapping.insert("hungary".to_string(), "country_HU".to_string());
    mapping.insert("romania".to_string(), "country_RO".to_string());
    mapping.insert("ukraine".to_string(), "country_UA".to_string());

    // Asia - East
    mapping.insert("japan".to_string(), "country_JP".to_string());
    mapping.insert("china".to_string(), "country_CN".to_string());
    mapping.insert("hong kong".to_string(), "country_HK".to_string());
    mapping.insert("south korea".to_string(), "country_KR".to_string());
    mapping.insert("korea".to_string(), "country_KR".to_string());
    mapping.insert("taiwan".to_string(), "country_TW".to_string());
    mapping.insert("mongolia".to_string(), "country_MN".to_string());

    // Asia - Southeast
    mapping.insert("singapore".to_string(), "country_SG".to_string());
    mapping.insert("indonesia".to_string(), "country_ID".to_string());
    mapping.insert("malaysia".to_string(), "country_MY".to_string());
    mapping.insert("thailand".to_string(), "country_TH".to_string());
    mapping.insert("vietnam".to_string(), "country_VN".to_string());
    mapping.insert("philippines".to_string(), "country_PH".to_string());

    // Asia - South
    mapping.insert("india".to_string(), "country_IN".to_string());
    mapping.insert("pakistan".to_string(), "country_PK".to_string());
    mapping.insert("bangladesh".to_string(), "country_BD".to_string());
    mapping.insert("sri lanka".to_string(), "country_LK".to_string());

    // Asia - West/Middle East
    mapping.insert("israel".to_string(), "country_IL".to_string());
    mapping.insert("turkey".to_string(), "country_TR".to_string());
    mapping.insert("saudi arabia".to_string(), "country_SA".to_string());
    mapping.insert("united arab emirates".to_string(), "country_AE".to_string());
    mapping.insert("uae".to_string(), "country_AE".to_string());
    mapping.insert("qatar".to_string(), "country_QA".to_string());
    mapping.insert("kuwait".to_string(), "country_KW".to_string());

    // Oceania
    mapping.insert("australia".to_string(), "country_AU".to_string());
    mapping.insert("new zealand".to_string(), "country_NZ".to_string());

    // South America
    mapping.insert("brazil".to_string(), "country_BR".to_string());
    mapping.insert("argentina".to_string(), "country_AR".to_string());
    mapping.insert("chile".to_string(), "country_CL".to_string());
    mapping.insert("colombia".to_string(), "country_CO".to_string());
    mapping.insert("peru".to_string(), "country_PE".to_string());
    mapping.insert("venezuela".to_string(), "country_VE".to_string());

    // Africa
    mapping.insert("south africa".to_string(), "country_ZA".to_string());
    mapping.insert("egypt".to_string(), "country_EG".to_string());
    mapping.insert("nigeria".to_string(), "country_NG".to_string());
    mapping.insert("kenya".to_string(), "country_KE".to_string());
    mapping.insert("morocco".to_string(), "country_MA".to_string());

    // Caribbean
    mapping.insert("cayman islands".to_string(), "country_KY".to_string());
    mapping.insert("puerto rico".to_string(), "country_PR".to_string());
    mapping.insert("bahamas".to_string(), "country_BS".to_string());

    mapping
}

/// Parse legacy sectors from profile JSON value
fn parse_legacy_sectors(value: &serde_json::Value) -> Result<Vec<LegacySector>, String> {
    // Handle both string JSON and direct array
    if let Some(s) = value.as_str() {
        if s.is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str(s).map_err(|e| format!("Failed to parse sectors JSON: {}", e))
    } else if value.is_array() {
        serde_json::from_value(value.clone())
            .map_err(|e| format!("Failed to parse sectors array: {}", e))
    } else if value.is_null() {
        Ok(Vec::new())
    } else {
        Err(format!("Unexpected sectors value type: {:?}", value))
    }
}

/// Parse legacy countries from profile JSON value
fn parse_legacy_countries(value: &serde_json::Value) -> Result<Vec<LegacyCountry>, String> {
    // Handle both string JSON and direct array
    if let Some(s) = value.as_str() {
        if s.is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str(s).map_err(|e| format!("Failed to parse countries JSON: {}", e))
    } else if value.is_array() {
        serde_json::from_value(value.clone())
            .map_err(|e| format!("Failed to parse countries array: {}", e))
    } else if value.is_null() {
        Ok(Vec::new())
    } else {
        Err(format!("Unexpected countries value type: {:?}", value))
    }
}

/// Find GICS category ID for a sector name
fn find_gics_category(sector_name: &str, mapping: &HashMap<String, String>) -> Option<String> {
    let normalized = sector_name.to_lowercase().trim().to_string();
    mapping.get(&normalized).cloned()
}

/// Find regions category ID for a country name
fn find_country_category(country_name: &str, mapping: &HashMap<String, String>) -> Option<String> {
    let normalized = country_name.to_lowercase().trim().to_string();
    mapping.get(&normalized).cloned()
}
