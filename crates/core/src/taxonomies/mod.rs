//! Taxonomies module - domain models, services, and traits.
//!
//! Provides asset classification taxonomies with hierarchical categories.

mod taxonomy_model;
mod taxonomy_service;
mod taxonomy_traits;

pub use taxonomy_model::{
    AssetTaxonomyAssignment, Category, CategoryJson, InstrumentMappingJson,
    NewAssetTaxonomyAssignment, NewCategory, NewTaxonomy, Taxonomy, TaxonomyJson,
    TaxonomyWithCategories,
};
pub use taxonomy_service::TaxonomyService;
pub use taxonomy_traits::{TaxonomyRepositoryTrait, TaxonomyServiceTrait};
