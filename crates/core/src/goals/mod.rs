//! Goals module - domain models, services, and traits.

mod goals_model;
mod goals_service;
mod goals_traits;

pub use goals_model::{Goal, GoalsAllocation, NewGoal};
pub use goals_service::GoalService;
pub use goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
