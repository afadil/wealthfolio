use serde::{Deserialize, Serialize};

/// Gradual shift from equities to bonds during the withdrawal phase to reduce SORR.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GlidepathSettings {
    pub enabled: bool,
    /// Expected annual return for the bond portion (e.g. 0.03 = 3 %).
    pub bond_return_rate: f64,
    /// Fraction held in bonds at the FIRE date (e.g. 0.2 = 20 %).
    pub bond_allocation_at_fire: f64,
    /// Fraction held in bonds at the planning horizon (e.g. 0.5 = 50 %).
    pub bond_allocation_at_horizon: f64,
}

// Re-export all output types from the canonical location.
pub use crate::planning::retirement::dto::*;
