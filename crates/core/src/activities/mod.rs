//! Activities module - domain models, services, and traits.

mod activities_constants;
mod activities_errors;
mod activities_model;
mod activities_service;
mod activities_traits;
mod compiler;
mod csv_parser;
mod idempotency;

#[cfg(test)]
mod activities_service_tests;

#[cfg(test)]
mod activities_model_tests;

pub use activities_constants::*;
pub use activities_errors::ActivityError;
pub use activities_model::{
    parse_decimal_string_tolerant, Activity, ActivityBulkIdentifierMapping,
    ActivityBulkMutationError, ActivityBulkMutationRequest, ActivityBulkMutationResult,
    ActivityDetails, ActivityImport, ActivitySearchResponse, ActivitySearchResponseMeta,
    ActivityStatus, ActivityType, ActivityUpdate, ActivityUpsert, AssetInput, BulkUpsertResult,
    ImportActivitiesResult, ImportActivitiesSummary, ImportMapping, ImportMappingData, IncomeData,
    NewActivity, Sort,
};
pub use activities_service::ActivityService;
pub use activities_traits::{ActivityRepositoryTrait, ActivityServiceTrait};
pub use compiler::{ActivityCompiler, DefaultActivityCompiler};
pub use csv_parser::{parse_csv, ParseConfig, ParseError, ParsedCsvResult};
pub use idempotency::{
    compute_activity_idempotency_key, compute_idempotency_key, generate_manual_idempotency_key,
};
