// Re-export from canonical modules under planning::retirement.
pub use crate::planning::retirement::analysis::*;
pub use crate::planning::retirement::dto::{
    compute_retirement_overview, compute_retirement_overview_with_mode,
};
pub use crate::planning::retirement::engine::{
    compute_required_capital, plan_net_fire_target, project_retirement,
    project_retirement_with_mode, try_compute_required_capital,
};
