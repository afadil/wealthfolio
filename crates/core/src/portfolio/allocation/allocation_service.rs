//! Service for computing portfolio allocations by taxonomy.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use log::debug;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::errors::Result;
use crate::portfolio::holdings::{Holding, HoldingType, HoldingsServiceTrait};
use crate::taxonomies::{Category, TaxonomyServiceTrait};

use super::{CategoryAllocation, PortfolioAllocations, TaxonomyAllocation};

/// Trait for allocation service.
#[async_trait]
pub trait AllocationServiceTrait: Send + Sync {
    /// Computes portfolio allocations for an account.
    /// If account_id is "PORTFOLIO", computes for all accounts.
    async fn get_portfolio_allocations(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> Result<PortfolioAllocations>;
}

/// Service for computing taxonomy-based portfolio allocations.
pub struct AllocationService {
    holdings_service: Arc<dyn HoldingsServiceTrait>,
    taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
}

impl AllocationService {
    pub fn new(
        holdings_service: Arc<dyn HoldingsServiceTrait>,
        taxonomy_service: Arc<dyn TaxonomyServiceTrait>,
    ) -> Self {
        Self {
            holdings_service,
            taxonomy_service,
        }
    }

    /// Aggregates holdings into a taxonomy allocation.
    /// For hierarchical taxonomies (GICS, Regions), rolls up to top-level categories.
    fn aggregate_by_taxonomy(
        &self,
        holdings: &[Holding],
        taxonomy_id: &str,
        taxonomy_name: &str,
        taxonomy_color: &str,
        categories: &[Category],
        assignments_by_asset: &HashMap<String, Vec<(String, String, i32)>>, // asset_id -> [(taxonomy_id, category_id, weight)]
        total_value: Decimal,
        rollup_to_top_level: bool,
    ) -> TaxonomyAllocation {
        // Build category lookup maps
        let category_by_id: HashMap<&str, &Category> =
            categories.iter().map(|c| (c.id.as_str(), c)).collect();

        // For rollup: map child categories to their top-level ancestor
        let top_level_map: HashMap<&str, &str> = if rollup_to_top_level {
            self.build_top_level_map(categories)
        } else {
            // Identity map - each category maps to itself
            categories
                .iter()
                .map(|c| (c.id.as_str(), c.id.as_str()))
                .collect()
        };

        // Aggregate values by category
        let mut category_values: HashMap<String, Decimal> = HashMap::new();

        for holding in holdings {
            // Skip cash holdings for sector/region allocation
            if holding.holding_type == HoldingType::Cash {
                continue;
            }

            let asset_id = match &holding.instrument {
                Some(instrument) => &instrument.id,
                None => continue,
            };

            let market_value = holding.market_value.base;

            // Get assignments for this asset and taxonomy
            if let Some(asset_assignments) = assignments_by_asset.get(asset_id) {
                let taxonomy_assignments: Vec<_> = asset_assignments
                    .iter()
                    .filter(|(tid, _, _)| tid == taxonomy_id)
                    .collect();

                if taxonomy_assignments.is_empty() {
                    // No assignment for this taxonomy - count as "Unknown"
                    *category_values
                        .entry("__UNKNOWN__".to_string())
                        .or_insert(Decimal::ZERO) += market_value;
                } else {
                    for (_, category_id, weight) in taxonomy_assignments {
                        // Convert weight from basis points (0-10000) to decimal (0-1)
                        let weight_decimal = Decimal::from(*weight) / dec!(10000);

                        // Roll up to top level if needed
                        let effective_category_id = if rollup_to_top_level {
                            top_level_map
                                .get(category_id.as_str())
                                .copied()
                                .unwrap_or(category_id.as_str())
                        } else {
                            category_id.as_str()
                        };

                        let weighted_value = market_value * weight_decimal;
                        *category_values
                            .entry(effective_category_id.to_string())
                            .or_insert(Decimal::ZERO) += weighted_value;
                    }
                }
            } else {
                // No assignments at all - count as "Unknown"
                *category_values
                    .entry("__UNKNOWN__".to_string())
                    .or_insert(Decimal::ZERO) += market_value;
            }
        }

        // Build category allocations
        let mut allocations: Vec<CategoryAllocation> = category_values
            .into_iter()
            .filter(|(_, value)| *value > Decimal::ZERO)
            .map(|(cat_id, value)| {
                let (name, color) = if cat_id == "__UNKNOWN__" {
                    ("Unknown".to_string(), "#878580".to_string())
                } else {
                    category_by_id
                        .get(cat_id.as_str())
                        .map(|c| (c.name.clone(), c.color.clone()))
                        .unwrap_or_else(|| (cat_id.clone(), "#808080".to_string()))
                };

                let percentage = if total_value > Decimal::ZERO {
                    (value / total_value * dec!(100)).round_dp(2)
                } else {
                    Decimal::ZERO
                };

                CategoryAllocation {
                    category_id: cat_id,
                    category_name: name,
                    color,
                    value,
                    percentage,
                }
            })
            .collect();

        // Sort by value descending
        allocations.sort_by(|a, b| b.value.cmp(&a.value));

        TaxonomyAllocation {
            taxonomy_id: taxonomy_id.to_string(),
            taxonomy_name: taxonomy_name.to_string(),
            color: taxonomy_color.to_string(),
            categories: allocations,
        }
    }

    /// Builds a map from each category to its top-level ancestor.
    /// Top-level categories are those with parent_id = None.
    fn build_top_level_map<'a>(&self, categories: &'a [Category]) -> HashMap<&'a str, &'a str> {
        let mut result: HashMap<&str, &str> = HashMap::new();

        // Build parent lookup
        let parent_map: HashMap<&str, Option<&str>> = categories
            .iter()
            .map(|c| (c.id.as_str(), c.parent_id.as_deref()))
            .collect();

        for category in categories {
            let top_level = self.find_top_level_ancestor(&category.id, &parent_map);
            result.insert(category.id.as_str(), top_level);
        }

        result
    }

    /// Recursively finds the top-level ancestor of a category.
    fn find_top_level_ancestor<'a>(
        &self,
        category_id: &'a str,
        parent_map: &HashMap<&str, Option<&'a str>>,
    ) -> &'a str {
        match parent_map.get(category_id) {
            Some(Some(parent_id)) => self.find_top_level_ancestor(parent_id, parent_map),
            _ => category_id, // No parent - this is the top level
        }
    }
}

#[async_trait]
impl AllocationServiceTrait for AllocationService {
    async fn get_portfolio_allocations(
        &self,
        account_id: &str,
        base_currency: &str,
    ) -> Result<PortfolioAllocations> {
        debug!(
            "Computing portfolio allocations for account {} in {}",
            account_id, base_currency
        );

        // 1. Get holdings
        let holdings = self
            .holdings_service
            .get_holdings(account_id, base_currency)
            .await?;

        if holdings.is_empty() {
            return Ok(PortfolioAllocations::default());
        }

        // 2. Compute total portfolio value (excluding cash for some allocations)
        let total_value: Decimal = holdings
            .iter()
            .filter(|h| h.holding_type != HoldingType::Cash)
            .map(|h| h.market_value.base)
            .sum();

        let total_with_cash: Decimal = holdings.iter().map(|h| h.market_value.base).sum();

        // 3. Get all taxonomies with categories
        let taxonomies = self.taxonomy_service.get_taxonomies_with_categories()?;

        // 4. Collect all asset IDs from holdings
        let asset_ids: Vec<String> = holdings
            .iter()
            .filter_map(|h| h.instrument.as_ref().map(|i| i.id.clone()))
            .collect();

        // 5. Get all assignments for these assets
        let mut assignments_by_asset: HashMap<String, Vec<(String, String, i32)>> = HashMap::new();

        for asset_id in &asset_ids {
            let assignments = self.taxonomy_service.get_asset_assignments(asset_id)?;
            let entries: Vec<(String, String, i32)> = assignments
                .into_iter()
                .map(|a| (a.taxonomy_id, a.category_id, a.weight))
                .collect();
            if !entries.is_empty() {
                assignments_by_asset.insert(asset_id.clone(), entries);
            }
        }

        // 6. Find each taxonomy and its categories
        let mut asset_classes_alloc =
            TaxonomyAllocation::empty("asset_classes", "Asset Classes", "#879a39");
        let mut sectors_alloc = TaxonomyAllocation::empty("industries_gics", "Sectors", "#da702c");
        let mut regions_alloc = TaxonomyAllocation::empty("regions", "Regions", "#8b7ec8");
        let mut risk_alloc = TaxonomyAllocation::empty("risk_category", "Risk Category", "#d14d41");
        let mut security_types_alloc =
            TaxonomyAllocation::empty("type_of_security", "Type of Security", "#3aa99f");
        let mut custom_allocs: Vec<TaxonomyAllocation> = Vec::new();

        for twc in taxonomies {
            let taxonomy = &twc.taxonomy;
            let categories = &twc.categories;

            match taxonomy.id.as_str() {
                "asset_classes" => {
                    // Asset classes include cash, use total_with_cash
                    asset_classes_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        &taxonomy.name,
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_with_cash,
                        false, // No rollup for asset classes
                    );
                    // Manually add cash holdings to Cash category
                    let cash_value: Decimal = holdings
                        .iter()
                        .filter(|h| h.holding_type == HoldingType::Cash)
                        .map(|h| h.market_value.base)
                        .sum();
                    if cash_value > Decimal::ZERO {
                        // Find or add Cash category
                        if let Some(cash_cat) = asset_classes_alloc
                            .categories
                            .iter_mut()
                            .find(|c| c.category_id == "CASH")
                        {
                            cash_cat.value += cash_value;
                            cash_cat.percentage = if total_with_cash > Decimal::ZERO {
                                (cash_cat.value / total_with_cash * dec!(100)).round_dp(2)
                            } else {
                                Decimal::ZERO
                            };
                        } else {
                            let percentage = if total_with_cash > Decimal::ZERO {
                                (cash_value / total_with_cash * dec!(100)).round_dp(2)
                            } else {
                                Decimal::ZERO
                            };
                            asset_classes_alloc.categories.push(CategoryAllocation {
                                category_id: "CASH".to_string(),
                                category_name: "Cash".to_string(),
                                color: "#c437c2".to_string(),
                                value: cash_value,
                                percentage,
                            });
                        }
                        // Re-sort by value
                        asset_classes_alloc
                            .categories
                            .sort_by(|a, b| b.value.cmp(&a.value));
                    }
                }
                "industries_gics" => {
                    sectors_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        "Sectors", // Use friendly name
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_value,
                        true, // Roll up to top-level GICS sectors
                    );
                }
                "regions" => {
                    regions_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        "Regions",
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_value,
                        true, // Roll up to top-level regions
                    );
                }
                "risk_category" => {
                    risk_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        "Risk Category",
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_value,
                        false, // No rollup for risk
                    );
                }
                "type_of_security" => {
                    security_types_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        "Type of Security",
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_value,
                        false, // No rollup - single-select taxonomy
                    );
                }
                _ if taxonomy.id == "custom_groups" || !taxonomy.is_system => {
                    // Custom taxonomies
                    let custom_alloc = self.aggregate_by_taxonomy(
                        &holdings,
                        &taxonomy.id,
                        &taxonomy.name,
                        &taxonomy.color,
                        categories,
                        &assignments_by_asset,
                        total_value,
                        false,
                    );
                    // Only include if there are any assignments
                    if !custom_alloc.categories.is_empty() {
                        custom_allocs.push(custom_alloc);
                    }
                }
                _ => {}
            }
        }

        Ok(PortfolioAllocations {
            asset_classes: asset_classes_alloc,
            sectors: sectors_alloc,
            regions: regions_alloc,
            risk_category: risk_alloc,
            security_types: security_types_alloc,
            custom_groups: custom_allocs,
            total_value: total_with_cash,
        })
    }
}
