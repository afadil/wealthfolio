//! Allocation models for portfolio breakdown by taxonomy.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Allocation breakdown for a single category within a taxonomy.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryAllocation {
    /// Category ID (from taxonomy_categories table)
    pub category_id: String,
    /// Display name of the category
    pub category_name: String,
    /// Color for visualization (hex code)
    pub color: String,
    /// Total value in base currency
    pub value: Decimal,
    /// Percentage of total portfolio (0-100)
    pub percentage: Decimal,
    /// Child category allocations (for drill-down). Only populated for rolled-up categories.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<CategoryAllocation>,
}

/// Allocation breakdown for a single taxonomy.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxonomyAllocation {
    /// Taxonomy ID
    pub taxonomy_id: String,
    /// Display name of the taxonomy
    pub taxonomy_name: String,
    /// Taxonomy color for UI
    pub color: String,
    /// Allocations per category, sorted by value descending
    pub categories: Vec<CategoryAllocation>,
}

impl TaxonomyAllocation {
    /// Creates an empty allocation for a taxonomy.
    pub fn empty(taxonomy_id: &str, taxonomy_name: &str, color: &str) -> Self {
        Self {
            taxonomy_id: taxonomy_id.to_string(),
            taxonomy_name: taxonomy_name.to_string(),
            color: color.to_string(),
            categories: Vec::new(),
        }
    }
}

/// Complete portfolio allocation breakdown across all taxonomies.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioAllocations {
    /// Asset class allocation (Equity, Debt, Cash, Real Estate, Commodity)
    pub asset_classes: TaxonomyAllocation,
    /// GICS sector allocation (rolled up to top 11 sectors)
    pub sectors: TaxonomyAllocation,
    /// Regional allocation (rolled up to top-level regions)
    pub regions: TaxonomyAllocation,
    /// Risk category allocation (Low, Medium, High, Unknown)
    pub risk_category: TaxonomyAllocation,
    /// Security type allocation (Stock, ETF, Fund, Bond, etc.)
    pub security_types: TaxonomyAllocation,
    /// Custom user-defined taxonomy allocations
    pub custom_groups: Vec<TaxonomyAllocation>,
    /// Total portfolio value in base currency
    pub total_value: Decimal,
}

impl Default for PortfolioAllocations {
    fn default() -> Self {
        Self {
            asset_classes: TaxonomyAllocation::empty("asset_classes", "Asset Classes", "#879a39"),
            sectors: TaxonomyAllocation::empty("industries_gics", "Sectors", "#da702c"),
            regions: TaxonomyAllocation::empty("regions", "Regions", "#8b7ec8"),
            risk_category: TaxonomyAllocation::empty("risk_category", "Risk Category", "#d14d41"),
            security_types: TaxonomyAllocation::empty(
                "instrument_type",
                "Instrument Type",
                "#4385be",
            ),
            custom_groups: Vec::new(),
            total_value: Decimal::ZERO,
        }
    }
}

/// Holdings within an allocation category.
/// Returned by get_holdings_by_allocation for drill-down views.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationHoldings {
    /// Taxonomy ID (e.g., "industries_gics", "asset_classes")
    pub taxonomy_id: String,
    /// Display name of the taxonomy (e.g., "Sectors", "Asset Classes")
    pub taxonomy_name: String,
    /// Category ID within the taxonomy (e.g., "45", "EQUITY")
    pub category_id: String,
    /// Display name of the category (e.g., "Information Technology", "Equity")
    pub category_name: String,
    /// Category color for UI
    pub color: String,
    /// Holdings in this category
    pub holdings: Vec<crate::portfolio::holdings::HoldingSummary>,
    /// Total value of holdings in this category
    pub total_value: Decimal,
    /// Base currency
    pub currency: String,
}
