//! SQLite storage implementation for goals.

mod model;
mod repository;

pub use model::{GoalDB, GoalsAllocationDB, NewGoalDB};
pub use repository::GoalRepository;
