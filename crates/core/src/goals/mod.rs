//! Goals module - domain models, services, and traits.

mod goals_model;
mod goals_service;
mod goals_traits;

pub use goals_model::{
    AccountValuationMap, Goal, GoalFundingRule, GoalFundingRuleInput, GoalPlan, GoalSummaryUpdate,
    NewGoal, PreparedRetirementSimulationInput, SaveGoalPlan,
};
pub use goals_service::{validate_retirement_plan, GoalService};
pub use goals_traits::{GoalRepositoryTrait, GoalServiceTrait};
