//! Asset classification service for taxonomy-based lookups.

use crate::taxonomies::{Category, TaxonomyServiceTrait};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Represents an asset's classifications across all taxonomies
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetClassifications {
    /// Primary type (from type_of_security taxonomy) - single value
    pub asset_type: Option<Category>,
    /// Risk level (from risk_category taxonomy) - single value
    pub risk_category: Option<Category>,
    /// Asset class allocations (from asset_classes taxonomy) - weighted
    pub asset_classes: Vec<CategoryWithWeight>,
    /// Sector allocations (from industries_gics taxonomy) - weighted
    pub sectors: Vec<CategoryWithWeight>,
    /// Regional allocations (from regions taxonomy) - weighted
    pub regions: Vec<CategoryWithWeight>,
    /// Custom group assignments - weighted
    pub custom_groups: Vec<CategoryWithWeight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryWithWeight {
    pub category: Category,
    pub weight: f64, // 0-100 percentage
}

pub struct AssetClassificationService {
    taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
}

impl AssetClassificationService {
    pub fn new(taxonomy_service: Arc<dyn TaxonomyServiceTrait>) -> Self {
        Self { taxonomy_service }
    }

    /// Get all classifications for an asset
    pub fn get_classifications(&self, asset_id: &str) -> Result<AssetClassifications, String> {
        let assignments = self
            .taxonomy_service
            .get_asset_assignments(asset_id)
            .map_err(|e| e.to_string())?;

        let mut classifications = AssetClassifications::default();

        for assignment in assignments {
            // Get taxonomy with categories to find the category
            let taxonomy_with_cats = self
                .taxonomy_service
                .get_taxonomy(&assignment.taxonomy_id)
                .map_err(|e| e.to_string())?;

            if let Some(twc) = taxonomy_with_cats {
                // Find the category in the taxonomy
                let category = twc
                    .categories
                    .iter()
                    .find(|c| c.id == assignment.category_id)
                    .cloned();

                if let Some(cat) = category {
                    let weight = assignment.weight as f64 / 100.0; // Convert basis points to percentage
                    let cat_with_weight = CategoryWithWeight {
                        category: cat.clone(),
                        weight,
                    };

                    match assignment.taxonomy_id.as_str() {
                        "type_of_security" => classifications.asset_type = Some(cat),
                        "risk_category" => classifications.risk_category = Some(cat),
                        "asset_classes" => classifications.asset_classes.push(cat_with_weight),
                        "industries_gics" => classifications.sectors.push(cat_with_weight),
                        "regions" => classifications.regions.push(cat_with_weight),
                        "custom_groups" => classifications.custom_groups.push(cat_with_weight),
                        _ => {}
                    }
                }
            }
        }

        Ok(classifications)
    }
}
