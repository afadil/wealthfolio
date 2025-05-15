use rust_decimal::Decimal;
use serde::de::Error;
use serde::{Deserialize, Deserializer, Serializer};
use std::str::FromStr;

// Import constants from models
use crate::constants::{DECIMAL_PRECISION, DISPLAY_DECIMAL_PRECISION};

// Custom serializer/deserializer for Decimal (rounds on serialization)
pub mod decimal_serde {
    use super::*; // Import parent scope items (Decimal, Error, etc.)

    pub fn serialize<S>(value: &Decimal, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let rounded = value.round_dp(DECIMAL_PRECISION); // Use imported constant
        serializer.serialize_str(&rounded.to_string())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Decimal, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: String = String::deserialize(deserializer)?;
        Decimal::from_str(&s).map_err(|_| D::Error::custom("Invalid Decimal"))
    }
}

// Custom serializer/deserializer for Option<Decimal>
pub mod decimal_serde_option {
    use super::*; // Import parent scope items

    pub fn serialize<S>(value: &Option<Decimal>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(d) => {
                let rounded = d.round_dp(DECIMAL_PRECISION); // Use imported constant
                serializer.serialize_str(&rounded.to_string())
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Decimal>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: Option<String> = Option::deserialize(deserializer)?;
        match s {
            Some(s) => {
                let d = Decimal::from_str(&s)
                    .map_err(|_| D::Error::custom("Invalid Decimal"))?;
                Ok(Some(d))
            }
            None => Ok(None),
        }
    }
}

// Custom serializer for Decimal, rounding to DISPLAY_DECIMAL_PRECISION
pub mod decimal_serde_round_display {
    use super::*; // Import parent scope items

    pub fn serialize<S>(value: &Decimal, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let rounded = value.round_dp(DISPLAY_DECIMAL_PRECISION); // Use imported constant
        serializer.serialize_str(&rounded.to_string())
    }
    
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Decimal, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: String = String::deserialize(deserializer)?;
        Decimal::from_str(&s).map_err(|_| D::Error::custom("Invalid Decimal"))
    }
} 