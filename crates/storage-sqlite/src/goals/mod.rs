//! SQLite storage implementation for goals.

mod model;
mod repository;

pub use model::{GoalDB, GoalPlanDB, GoalsAllocationDB, NewGoalDB};
pub use repository::GoalRepository;

// Re-export for sync outbox (physical table name unchanged)
pub type GoalFundingRuleDB = GoalsAllocationDB;
