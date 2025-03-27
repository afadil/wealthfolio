pub mod goals_repository;
pub mod goals_service;
pub mod goals_model;
pub mod goals_errors;

pub use goals_service::GoalService;
pub use goals_errors::{GoalError, Result};
