use crate::activities::{
    is_securities_transfer, Activity, ActivityCompiler, DefaultActivityCompiler,
    ACTIVITY_SUBTYPE_BONUS, ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND, ACTIVITY_SUBTYPE_DRIP,
    ACTIVITY_SUBTYPE_STAKING_REWARD, ACTIVITY_TYPE_BUY, ACTIVITY_TYPE_CREDIT,
    ACTIVITY_TYPE_DEPOSIT, ACTIVITY_TYPE_DIVIDEND, ACTIVITY_TYPE_FEE, ACTIVITY_TYPE_INTEREST,
    ACTIVITY_TYPE_SELL, ACTIVITY_TYPE_SPLIT, ACTIVITY_TYPE_TAX, ACTIVITY_TYPE_TRANSFER_IN,
    ACTIVITY_TYPE_TRANSFER_OUT, ACTIVITY_TYPE_WITHDRAWAL,
};
use crate::fx::currency::{currency_minor_unit, normalize_amount, normalize_currency_code};
use crate::portfolio::valuation::ExternalFlowSource;
use crate::quotes::Quote;
use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EconomicEventKind {
    CashFlow,
    ExternalSecurityDeliveryIn,
    ExternalSecurityDeliveryOut,
    InternalSecurityTransfer,
    Trade,
    Income,
    Fee,
    Tax,
    UnknownBoundaryTransfer,
    Other,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BasisStatus {
    Complete,
    PartialUnknown,
    Unknown,
    #[default]
    NotApplicable,
}

impl BasisStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Complete => "COMPLETE",
            Self::PartialUnknown => "PARTIAL_UNKNOWN",
            Self::Unknown => "UNKNOWN",
            Self::NotApplicable => "NOT_APPLICABLE",
        }
    }

    pub fn from_code(value: &str) -> Self {
        match value.trim().to_ascii_uppercase().as_str() {
            "COMPLETE" => Self::Complete,
            "PARTIAL_UNKNOWN" | "PARTIAL" => Self::PartialUnknown,
            "UNKNOWN" => Self::Unknown,
            "NOT_APPLICABLE" | "N/A" | "NA" => Self::NotApplicable,
            _ => Self::Unknown,
        }
    }

    pub fn combine(self, next: Self) -> Self {
        match (self, next) {
            (Self::PartialUnknown, _) | (_, Self::PartialUnknown) => Self::PartialUnknown,
            (Self::Complete, Self::Unknown) | (Self::Unknown, Self::Complete) => {
                Self::PartialUnknown
            }
            (Self::Unknown, _) | (_, Self::Unknown) => Self::Unknown,
            (Self::Complete, _) | (_, Self::Complete) => Self::Complete,
            (Self::NotApplicable, Self::NotApplicable) => Self::NotApplicable,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransferBoundary {
    Internal,
    External,
    Unknown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedActivityEconomics {
    pub kind: EconomicEventKind,
    pub lot_cost_basis_value: Decimal,
    pub lot_cost_basis_currency: String,
    pub performance_flow_value: Decimal,
    pub performance_flow_currency: String,
    pub performance_flow_source: ExternalFlowSource,
    pub basis_status: BasisStatus,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EconomicEventEffect {
    pub activity_id: String,
    pub account_id: String,
    pub asset_id: Option<String>,
    pub date: NaiveDate,
    pub event_kind: EconomicEventKind,
    /// Signed external flow. Positive means contribution; negative means distribution.
    pub external_flow: Decimal,
    pub realized_pnl: Decimal,
    pub unrealized_movement: Decimal,
    pub income: Decimal,
    pub fee: Decimal,
    pub tax: Decimal,
    pub fx_effect: Decimal,
    pub diagnostics: Vec<String>,
}

impl EconomicEventEffect {
    pub fn empty(activity: &Activity, date: NaiveDate, event_kind: EconomicEventKind) -> Self {
        Self {
            activity_id: activity.id.clone(),
            account_id: activity.account_id.clone(),
            asset_id: activity.asset_id.clone(),
            date,
            event_kind,
            external_flow: Decimal::ZERO,
            realized_pnl: Decimal::ZERO,
            unrealized_movement: Decimal::ZERO,
            income: Decimal::ZERO,
            fee: Decimal::ZERO,
            tax: Decimal::ZERO,
            fx_effect: Decimal::ZERO,
            diagnostics: Vec::new(),
        }
    }
}

pub struct ActivityEconomicsResolver;

/// Flat cash inputs shared by persistence normalization, migration, and the
/// runtime economics resolver. Monetary fields are magnitudes; direction is a
/// property of the activity economics, never the stored sign.
#[derive(Clone, Copy, Debug)]
pub struct ActivityCashInputs<'a> {
    pub activity_type: &'a str,
    /// Activity currency; scales currency-relative tolerances (minor units).
    pub currency: &'a str,
    pub is_security_transfer: bool,
    pub quantity: Option<Decimal>,
    pub unit_price: Option<Decimal>,
    pub amount: Option<Decimal>,
    pub fee: Option<Decimal>,
    pub tax: Option<Decimal>,
    pub unit_multiplier: Decimal,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ResolvedActivityCash {
    /// Authoritative stored final cash magnitude. Explicit zero is preserved.
    pub final_amount: Option<Decimal>,
    /// Signed final cash movement. Positive is an inflow; negative is an outflow.
    pub signed_cash_effect: Option<Decimal>,
    /// Pre-charge economics reverse-derived from final cash and charges.
    pub gross_amount: Option<Decimal>,
    /// Signed gross economic flow, independent from a charges-over-proceeds
    /// reversal in final cash.
    pub signed_gross_effect: Option<Decimal>,
}

impl ActivityEconomicsResolver {
    pub fn resolve_cash(activity: &Activity, unit_multiplier: Decimal) -> ResolvedActivityCash {
        Self::resolve_cash_inputs(ActivityCashInputs {
            activity_type: activity.effective_type(),
            currency: &activity.currency,
            is_security_transfer: Self::is_security_transfer(activity),
            quantity: activity.quantity,
            unit_price: activity.unit_price,
            amount: activity.amount,
            fee: activity.fee,
            tax: activity.tax,
            unit_multiplier,
        })
    }

    /// Resolves the one direction exception that depends on account context.
    /// Investment-account interest is income; credit-card interest is a charge.
    pub fn resolve_cash_with_account_context(
        activity: &Activity,
        unit_multiplier: Decimal,
        is_credit_card_account: bool,
    ) -> ResolvedActivityCash {
        let mut resolved = Self::resolve_cash(activity, unit_multiplier);
        if is_credit_card_account && activity.effective_type() == ACTIVITY_TYPE_INTEREST {
            resolved.signed_cash_effect = resolved.final_amount.map(|amount| -amount.abs());
            resolved.signed_gross_effect = resolved.gross_amount.map(|amount| -amount.abs());
        }
        resolved
    }

    /// Resolves the cash movement of a stored event after expanding composite
    /// activities (DRIP, staking rewards, dividend in kind) through the same
    /// compiler used by the holdings engine. Parent-row diagnostics remain
    /// attached to the stored amount; only the signed movement is aggregated
    /// from canonical postings.
    pub fn resolve_compiled_cash(
        activity: &Activity,
        unit_multiplier: Decimal,
        is_credit_card_account: bool,
    ) -> crate::Result<ResolvedActivityCash> {
        let mut resolved = Self::resolve_cash_with_account_context(
            activity,
            unit_multiplier,
            is_credit_card_account,
        );
        let postings = DefaultActivityCompiler::new().compile(activity)?;
        if postings.is_empty() {
            resolved.signed_cash_effect = None;
            resolved.signed_gross_effect = None;
            return Ok(resolved);
        }

        // A compiled total is known only when every posting is known. Skipping
        // an unavailable posting would misreport the remaining partial sum.
        let mut signed_cash_effect = Some(Decimal::ZERO);
        let mut signed_gross_effect = Some(Decimal::ZERO);
        for posting in postings {
            let posting_cash = Self::resolve_cash_with_account_context(
                &posting,
                unit_multiplier,
                is_credit_card_account,
            );
            signed_cash_effect = signed_cash_effect.and_then(|total| {
                posting_cash
                    .signed_cash_effect
                    .and_then(|effect| total.checked_add(effect))
            });
            signed_gross_effect = signed_gross_effect.and_then(|total| {
                posting_cash
                    .signed_gross_effect
                    .and_then(|effect| total.checked_add(effect))
            });
        }
        resolved.signed_cash_effect = signed_cash_effect;
        resolved.signed_gross_effect = signed_gross_effect;
        Ok(resolved)
    }

    /// Runtime cash resolution is deliberately final-only. It never treats a
    /// stored amount as legacy gross and never substitutes a derived amount for
    /// a missing stored value. Derivation is restricted to proving direction
    /// for exceptional charges-over-proceeds cases.
    pub fn resolve_cash_inputs(inputs: ActivityCashInputs<'_>) -> ResolvedActivityCash {
        if inputs.activity_type == ACTIVITY_TYPE_SPLIT {
            return ResolvedActivityCash::default();
        }

        let fee = inputs.fee.unwrap_or(Decimal::ZERO).abs();
        if inputs.is_security_transfer {
            return ResolvedActivityCash {
                final_amount: (fee > Decimal::ZERO).then_some(fee),
                signed_cash_effect: (fee > Decimal::ZERO).then_some(-fee),
                gross_amount: (fee > Decimal::ZERO).then_some(fee),
                signed_gross_effect: (fee > Decimal::ZERO).then_some(-fee),
            };
        }

        let tax = inputs.tax.unwrap_or(Decimal::ZERO).abs();
        // `None` when the two charges cannot be totalled; the gross derivation
        // below is the only consumer, and it already models having no gross.
        let charges = fee.checked_add(tax);
        let expected_effect = Self::calculate_trade_cash_effect(inputs)
            .or_else(|| Self::calculate_standalone_charge_amount(inputs).map(|amount| -amount));
        let final_amount = inputs.amount.map(|amount| amount.abs());
        let signed_cash_effect = final_amount.map(|amount| {
            if amount.is_zero() {
                return Decimal::ZERO;
            }
            // A final amount is authoritative, so charges cannot reverse the
            // direction of typed deposits or income. SELL is the sole
            // magnitude-only event whose final cash can legitimately become
            // an outflow when charges exceed proceeds, and only when the
            // quantity/price economics reproduce that final magnitude.
            // Keep in lockstep with `isProvenNegativeSell` in
            // apps/frontend/src/lib/activity-utils.ts, including the epsilon.
            // One minor unit of the activity currency covers stored totals
            // the migration/writer preserved within their acceptance bands
            // (0.01 for USD, 1 for JPY, 1e-8 for BTC); a currency-blind
            // floor would flip such sells to inflows or over-reverse crypto.
            let reversal_tolerance =
                (amount * Decimal::new(1, 8)).max(currency_minor_unit(inputs.currency));
            if inputs.activity_type == ACTIVITY_TYPE_SELL
                && expected_effect.is_some_and(|expected| {
                    expected.is_sign_negative()
                        && (expected.abs() - amount).abs() <= reversal_tolerance
                })
            {
                -amount
            } else {
                Self::type_directed_cash_effect(inputs.activity_type, amount)
            }
        });

        let gross_amount = signed_cash_effect.and_then(|signed_final| {
            // Negation is always representable: `Decimal::MIN` is exactly
            // `-Decimal::MAX`. Adding the charges back on is not.
            let gross = match inputs.activity_type {
                ACTIVITY_TYPE_BUY => (-signed_final).checked_sub(charges?)?,
                ACTIVITY_TYPE_SELL
                | ACTIVITY_TYPE_DEPOSIT
                | ACTIVITY_TYPE_DIVIDEND
                | ACTIVITY_TYPE_INTEREST
                | ACTIVITY_TYPE_CREDIT
                | ACTIVITY_TYPE_TRANSFER_IN => signed_final.checked_add(charges?)?,
                ACTIVITY_TYPE_WITHDRAWAL | ACTIVITY_TYPE_TRANSFER_OUT => {
                    (-signed_final).checked_sub(charges?)?
                }
                ACTIVITY_TYPE_FEE | ACTIVITY_TYPE_TAX => final_amount?,
                _ => return None,
            };
            (gross >= Decimal::ZERO).then_some(gross)
        });
        let signed_gross_effect =
            gross_amount.map(|gross| Self::type_directed_cash_effect(inputs.activity_type, gross));

        ResolvedActivityCash {
            final_amount,
            signed_cash_effect,
            gross_amount,
            signed_gross_effect,
        }
    }

    /// Calculates canonical final cash for a complete BUY or SELL. This is a
    /// persistence-boundary operation; runtime resolution never calls it to
    /// replace a missing stored amount.
    pub fn calculate_trade_final_cash(inputs: ActivityCashInputs<'_>) -> Option<Decimal> {
        Self::calculate_trade_cash_effect(inputs).map(|amount| amount.abs())
    }

    /// Copies the explicit charge carried by standalone FEE/TAX activities.
    /// Ordinary cash and income activities deliberately have no derivation
    /// helper.
    pub fn calculate_standalone_charge_amount(inputs: ActivityCashInputs<'_>) -> Option<Decimal> {
        match inputs.activity_type {
            ACTIVITY_TYPE_FEE => inputs.fee.map(|amount| amount.abs()),
            ACTIVITY_TYPE_TAX => inputs
                .tax
                .filter(|amount| !amount.is_zero())
                .map(|amount| amount.abs())
                .or_else(|| inputs.fee.map(|amount| amount.abs()))
                .or_else(|| inputs.tax.map(|amount| amount.abs())),
            _ => None,
        }
    }

    /// Recognized asset-income composites explicitly define their value as
    /// quantity × unit price. No other income/cash subtype may use this path.
    pub fn calculate_composite_final_cash(
        activity_type: &str,
        subtype: Option<&str>,
        quantity: Option<Decimal>,
        unit_price: Option<Decimal>,
        unit_multiplier: Decimal,
    ) -> Option<Decimal> {
        let subtype = subtype?.trim();
        let recognized = (activity_type == ACTIVITY_TYPE_DIVIDEND
            && (subtype.eq_ignore_ascii_case(ACTIVITY_SUBTYPE_DRIP)
                || subtype.eq_ignore_ascii_case(ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND)))
            || (activity_type == ACTIVITY_TYPE_INTEREST
                && subtype.eq_ignore_ascii_case(ACTIVITY_SUBTYPE_STAKING_REWARD));
        if !recognized {
            return None;
        }

        let gross = quantity?
            .abs()
            .checked_mul(unit_price?.abs())?
            .checked_mul(Self::valid_unit_multiplier(unit_multiplier))?;
        (!gross.is_zero()).then_some(gross)
    }

    fn calculate_trade_cash_effect(inputs: ActivityCashInputs<'_>) -> Option<Decimal> {
        if inputs.is_security_transfer
            || !matches!(inputs.activity_type, ACTIVITY_TYPE_BUY | ACTIVITY_TYPE_SELL)
        {
            return None;
        }

        let gross = Self::derived_positive_gross(inputs)?;
        let fee = inputs.fee.unwrap_or(Decimal::ZERO).abs();
        let tax = inputs.tax.unwrap_or(Decimal::ZERO).abs();
        Self::cash_effect_from_trade_gross(inputs.activity_type, gross, fee, tax)
    }

    /// `None` when the row carries no quantity or price, and equally when their
    /// product cannot be represented: `rust_decimal` panics on overflow rather
    /// than saturating, and a figure we cannot compute is not one to derive
    /// cash from.
    pub(crate) fn derived_positive_gross(inputs: ActivityCashInputs<'_>) -> Option<Decimal> {
        let multiplier = Self::valid_unit_multiplier(inputs.unit_multiplier);
        let gross = inputs
            .quantity?
            .abs()
            .checked_mul(inputs.unit_price?.abs())?
            .checked_mul(multiplier)?;
        (gross > Decimal::ZERO).then_some(gross)
    }

    fn cash_effect_from_trade_gross(
        activity_type: &str,
        gross: Decimal,
        fee: Decimal,
        tax: Decimal,
    ) -> Option<Decimal> {
        let charges = fee.abs().checked_add(tax.abs())?;
        match activity_type {
            ACTIVITY_TYPE_BUY => gross.abs().checked_add(charges).map(|total| -total),
            ACTIVITY_TYPE_SELL => gross.abs().checked_sub(charges),
            _ => None,
        }
    }

    fn type_directed_cash_effect(activity_type: &str, amount: Decimal) -> Decimal {
        match activity_type {
            ACTIVITY_TYPE_SELL
            | ACTIVITY_TYPE_DEPOSIT
            | ACTIVITY_TYPE_DIVIDEND
            | ACTIVITY_TYPE_INTEREST
            | ACTIVITY_TYPE_CREDIT
            | ACTIVITY_TYPE_TRANSFER_IN => amount.abs(),
            ACTIVITY_TYPE_BUY
            | ACTIVITY_TYPE_WITHDRAWAL
            | ACTIVITY_TYPE_FEE
            | ACTIVITY_TYPE_TAX
            | ACTIVITY_TYPE_TRANSFER_OUT => -amount.abs(),
            _ => Decimal::ZERO,
        }
    }

    pub fn compile_activity(
        activity: &Activity,
        quote: Option<&Quote>,
        transfer_boundary: TransferBoundary,
    ) -> ResolvedActivityEconomics {
        Self::compile_activity_with_unit_multiplier(
            activity,
            quote,
            transfer_boundary,
            Decimal::ONE,
        )
    }

    pub fn compile_activity_with_unit_multiplier(
        activity: &Activity,
        quote: Option<&Quote>,
        transfer_boundary: TransferBoundary,
        unit_multiplier: Decimal,
    ) -> ResolvedActivityEconomics {
        let activity_currency = normalize_currency_code(&activity.currency).to_string();
        let kind = Self::event_kind(activity, transfer_boundary);
        let is_security_transfer = Self::is_security_transfer(activity);
        let unit_multiplier = Self::valid_unit_multiplier(unit_multiplier);
        let lot_cost_basis_value = if is_security_transfer {
            Self::lot_cost_basis_value_with_unit_multiplier(activity, unit_multiplier)
        } else {
            Decimal::ZERO
        };
        let lot_cost_basis_uses_legacy_amount =
            is_security_transfer && Self::lot_cost_basis_uses_legacy_amount(activity);
        let mut diagnostics = Vec::new();
        let basis_status = if !is_security_transfer {
            BasisStatus::NotApplicable
        } else if lot_cost_basis_value.is_zero() {
            if Self::security_transfer_has_book_basis(activity) {
                diagnostics.push(format!(
                    "Security transfer activity {} could not derive a usable cost basis from its supplied values.",
                    activity.id
                ));
            }
            BasisStatus::Unknown
        } else {
            BasisStatus::Complete
        };

        if kind == EconomicEventKind::UnknownBoundaryTransfer {
            diagnostics.push(format!(
                "Transfer activity {} has no valid pair and is not explicitly external.",
                activity.id
            ));
        }

        if kind == EconomicEventKind::InternalSecurityTransfer {
            return ResolvedActivityEconomics {
                kind,
                lot_cost_basis_value,
                lot_cost_basis_currency: activity_currency.clone(),
                performance_flow_value: Decimal::ZERO,
                performance_flow_currency: activity_currency,
                performance_flow_source: ExternalFlowSource::Unknown,
                basis_status,
                diagnostics,
            };
        }

        if is_security_transfer {
            if let Some(quote) = quote {
                let (normalized_price, normalized_currency) =
                    normalize_amount(quote.close, &quote.currency);
                // An unrepresentable product is as unusable as a zero one, and
                // takes the same route: the fallbacks below, which already
                // exist for a transfer with no quote.
                let market_value = activity
                    .qty()
                    .checked_mul(normalized_price)
                    .and_then(|value| value.checked_mul(unit_multiplier))
                    .filter(|value| !value.is_zero());
                if let Some(market_value) = market_value {
                    return ResolvedActivityEconomics {
                        kind,
                        lot_cost_basis_value,
                        lot_cost_basis_currency: activity_currency,
                        performance_flow_value: market_value.abs(),
                        performance_flow_currency: normalize_currency_code(normalized_currency)
                            .to_string(),
                        performance_flow_source: if kind
                            == EconomicEventKind::UnknownBoundaryTransfer
                        {
                            ExternalFlowSource::UnknownBoundaryTransfer
                        } else {
                            ExternalFlowSource::QuoteDerivedMarketValue
                        },
                        basis_status,
                        diagnostics,
                    };
                }
            }

            if activity.effective_type() == ACTIVITY_TYPE_TRANSFER_OUT {
                diagnostics.push(format!(
                    "Security transfer-out activity {} deferred performance flow to removed lot basis because no transfer-date quote was available.",
                    activity.id
                ));
                return ResolvedActivityEconomics {
                    kind,
                    lot_cost_basis_value,
                    lot_cost_basis_currency: activity_currency.clone(),
                    performance_flow_value: Decimal::ZERO,
                    performance_flow_currency: activity_currency,
                    performance_flow_source: if kind == EconomicEventKind::UnknownBoundaryTransfer {
                        ExternalFlowSource::UnknownBoundaryTransfer
                    } else {
                        ExternalFlowSource::Unknown
                    },
                    basis_status: if lot_cost_basis_value.is_zero() {
                        BasisStatus::Unknown
                    } else {
                        BasisStatus::Complete
                    },
                    diagnostics,
                };
            }

            if !lot_cost_basis_value.is_zero() {
                if lot_cost_basis_uses_legacy_amount {
                    diagnostics.push(format!(
                        "Security transfer activity {} used legacy activity amount as cost basis and performance flow fallback because quote and unit price were unavailable.",
                        activity.id
                    ));
                } else {
                    diagnostics.push(format!(
                        "Security transfer activity {} used cost basis as performance flow fallback because no transfer-date quote was available.",
                        activity.id
                    ));
                }
                return ResolvedActivityEconomics {
                    kind,
                    lot_cost_basis_value,
                    lot_cost_basis_currency: activity_currency.clone(),
                    performance_flow_value: lot_cost_basis_value.abs(),
                    performance_flow_currency: activity_currency,
                    performance_flow_source: if kind == EconomicEventKind::UnknownBoundaryTransfer {
                        ExternalFlowSource::UnknownBoundaryTransfer
                    } else if lot_cost_basis_uses_legacy_amount {
                        ExternalFlowSource::LegacyActivityAmountFallback
                    } else {
                        ExternalFlowSource::CostBasisFallback
                    },
                    basis_status: BasisStatus::Complete,
                    diagnostics,
                };
            }

            if let Some(amount) = activity.amount.filter(|amount| !amount.is_zero()) {
                diagnostics.push(format!(
                    "Security transfer activity {} used legacy activity amount as performance flow fallback because quote and cost basis were unavailable.",
                    activity.id
                ));
                return ResolvedActivityEconomics {
                    kind,
                    lot_cost_basis_value,
                    lot_cost_basis_currency: activity_currency.clone(),
                    performance_flow_value: amount.abs(),
                    performance_flow_currency: activity_currency,
                    performance_flow_source: if kind == EconomicEventKind::UnknownBoundaryTransfer {
                        ExternalFlowSource::UnknownBoundaryTransfer
                    } else {
                        ExternalFlowSource::LegacyActivityAmountFallback
                    },
                    basis_status: BasisStatus::Unknown,
                    diagnostics,
                };
            }

            diagnostics.push(format!(
                "Security transfer activity {} has no quote, cost basis, or legacy amount for performance flow.",
                activity.id
            ));
            return ResolvedActivityEconomics {
                kind,
                lot_cost_basis_value,
                lot_cost_basis_currency: activity_currency.clone(),
                performance_flow_value: Decimal::ZERO,
                performance_flow_currency: activity_currency,
                performance_flow_source: ExternalFlowSource::UnknownBoundaryTransfer,
                basis_status: BasisStatus::Unknown,
                diagnostics,
            };
        }

        if kind == EconomicEventKind::UnknownBoundaryTransfer {
            return ResolvedActivityEconomics {
                kind,
                lot_cost_basis_value,
                lot_cost_basis_currency: activity_currency.clone(),
                performance_flow_value: Decimal::ZERO,
                performance_flow_currency: activity_currency,
                performance_flow_source: ExternalFlowSource::UnknownBoundaryTransfer,
                basis_status: BasisStatus::NotApplicable,
                diagnostics,
            };
        }

        let performance_flow_value = Self::cash_flow_gross_amount(activity);
        let performance_flow_source = if performance_flow_value.is_zero() {
            ExternalFlowSource::Unknown
        } else {
            ExternalFlowSource::CashAmount
        };

        ResolvedActivityEconomics {
            kind,
            lot_cost_basis_value,
            lot_cost_basis_currency: activity_currency.clone(),
            performance_flow_value,
            performance_flow_currency: activity_currency,
            performance_flow_source,
            basis_status: BasisStatus::NotApplicable,
            diagnostics,
        }
    }

    pub fn is_security_transfer(activity: &Activity) -> bool {
        is_securities_transfer(activity.effective_type(), activity.asset_id.as_deref())
    }

    pub fn lot_cost_basis_value(activity: &Activity) -> Decimal {
        Self::lot_cost_basis_value_with_unit_multiplier(activity, Decimal::ONE)
    }

    pub fn lot_cost_basis_value_with_unit_multiplier(
        activity: &Activity,
        unit_multiplier: Decimal,
    ) -> Decimal {
        let quantity = activity.qty();
        let price_basis = quantity
            .checked_mul(activity.price())
            .and_then(|value| value.checked_mul(Self::valid_unit_multiplier(unit_multiplier)))
            .filter(|value| !value.is_zero());
        if let Some(price_basis) = price_basis {
            return price_basis;
        }

        if activity.effective_type() == ACTIVITY_TYPE_TRANSFER_IN && !quantity.is_zero() {
            activity.amount.unwrap_or(Decimal::ZERO).abs()
        } else {
            Decimal::ZERO
        }
    }

    fn lot_cost_basis_uses_legacy_amount(activity: &Activity) -> bool {
        let unit_price_missing_or_zero = activity
            .unit_price
            .map(|unit_price| unit_price.is_zero())
            .unwrap_or(true);

        activity.effective_type() == ACTIVITY_TYPE_TRANSFER_IN
            && activity.quantity.is_some_and(|qty| !qty.is_zero())
            && unit_price_missing_or_zero
            && activity.amount.is_some_and(|amount| !amount.is_zero())
    }

    pub fn security_transfer_has_book_basis(activity: &Activity) -> bool {
        Self::is_security_transfer(activity)
            && activity.quantity.is_some_and(|qty| !qty.is_zero())
            && (activity.unit_price.is_some_and(|price| !price.is_zero())
                || (activity.effective_type() == ACTIVITY_TYPE_TRANSFER_IN
                    && activity.amount.is_some_and(|amount| !amount.is_zero())))
    }

    fn event_kind(activity: &Activity, transfer_boundary: TransferBoundary) -> EconomicEventKind {
        match activity.effective_type() {
            ACTIVITY_TYPE_DEPOSIT | ACTIVITY_TYPE_WITHDRAWAL => EconomicEventKind::CashFlow,
            ACTIVITY_TYPE_CREDIT
                if activity.subtype.as_deref().is_some_and(|subtype| {
                    subtype.eq_ignore_ascii_case(ACTIVITY_SUBTYPE_BONUS)
                }) =>
            {
                EconomicEventKind::CashFlow
            }
            ACTIVITY_TYPE_BUY | ACTIVITY_TYPE_SELL => EconomicEventKind::Trade,
            ACTIVITY_TYPE_DIVIDEND | ACTIVITY_TYPE_INTEREST | ACTIVITY_TYPE_CREDIT => {
                EconomicEventKind::Income
            }
            ACTIVITY_TYPE_FEE => EconomicEventKind::Fee,
            ACTIVITY_TYPE_TAX => EconomicEventKind::Tax,
            ACTIVITY_TYPE_TRANSFER_IN | ACTIVITY_TYPE_TRANSFER_OUT => {
                Self::transfer_event_kind(activity, transfer_boundary)
            }
            _ => EconomicEventKind::Other,
        }
    }

    fn transfer_event_kind(
        activity: &Activity,
        transfer_boundary: TransferBoundary,
    ) -> EconomicEventKind {
        match transfer_boundary {
            TransferBoundary::Internal => EconomicEventKind::InternalSecurityTransfer,
            TransferBoundary::Unknown => EconomicEventKind::UnknownBoundaryTransfer,
            TransferBoundary::External => match activity.effective_type() {
                ACTIVITY_TYPE_TRANSFER_IN if Self::is_security_transfer(activity) => {
                    EconomicEventKind::ExternalSecurityDeliveryIn
                }
                ACTIVITY_TYPE_TRANSFER_OUT if Self::is_security_transfer(activity) => {
                    EconomicEventKind::ExternalSecurityDeliveryOut
                }
                _ => EconomicEventKind::CashFlow,
            },
        }
    }

    fn cash_flow_gross_amount(activity: &Activity) -> Decimal {
        Self::resolve_cash(activity, Decimal::ONE)
            .gross_amount
            .unwrap_or(Decimal::ZERO)
    }

    fn valid_unit_multiplier(unit_multiplier: Decimal) -> Decimal {
        if unit_multiplier > Decimal::ZERO {
            unit_multiplier
        } else {
            Decimal::ONE
        }
    }
}

#[cfg(test)]
mod cash_tests {
    use super::*;
    use crate::assets::{Asset, InstrumentType};
    use rust_decimal_macros::dec;

    fn inputs(activity_type: &'static str) -> ActivityCashInputs<'static> {
        ActivityCashInputs {
            activity_type,
            currency: "USD",
            is_security_transfer: false,
            quantity: Some(dec!(2)),
            unit_price: Some(dec!(10)),
            amount: None,
            fee: Some(dec!(1)),
            tax: Some(dec!(2)),
            unit_multiplier: Decimal::ONE,
        }
    }

    fn stored_activity(activity_type: &str) -> Activity {
        Activity {
            id: "activity-1".to_string(),
            account_id: "account-1".to_string(),
            asset_id: Some("asset-1".to_string()),
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: crate::activities::ActivityStatus::Posted,
            activity_date: chrono::Utc::now(),
            settlement_date: None,
            quantity: None,
            unit_price: None,
            amount: None,
            fee: None,
            tax: None,
            currency: "USD".to_string(),
            fx_rate: None,
            notes: None,
            metadata: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,
            is_user_modified: false,
            needs_review: false,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn charges_exceeding_gross_reverse_a_sell_at_a_non_unit_multiplier() {
        // Gross is 1 x 1 x 10 = 10, so charges of 12 prove the reversal and
        // the stored 2 books as an outflow. The multiplier comes from the
        // asset the caller passes - the row owns no multiplier of its own.
        let mut sell = stored_activity(ACTIVITY_TYPE_SELL);
        sell.quantity = Some(dec!(1));
        sell.unit_price = Some(dec!(1));
        sell.fee = Some(dec!(12));
        sell.amount = Some(dec!(2));

        let resolved = ActivityEconomicsResolver::resolve_cash(&sell, dec!(10));

        assert_eq!(resolved.signed_cash_effect, Some(dec!(-2)));
    }

    #[test]
    fn transfer_lot_basis_applies_the_asset_multiplier() {
        // Security-transfer lot basis is qty x price x multiplier, taken from
        // the asset multiplier the caller passes.
        let mut transfer = stored_activity("TRANSFER_IN");
        transfer.quantity = Some(dec!(1));
        transfer.unit_price = Some(dec!(5));

        let compiled = ActivityEconomicsResolver::compile_activity_with_unit_multiplier(
            &transfer,
            None,
            TransferBoundary::External,
            dec!(10),
        );

        assert_eq!(compiled.lot_cost_basis_value, dec!(50));
    }

    #[test]
    fn supplied_amount_is_always_authoritative_final_cash() {
        let mut dividend = inputs(ACTIVITY_TYPE_DIVIDEND);
        dividend.amount = Some(dec!(100));
        dividend.tax = Some(dec!(15));
        dividend.fee = None;

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(dividend);

        assert_eq!(resolved.final_amount, Some(dec!(100)));
        assert_eq!(resolved.signed_cash_effect, Some(dec!(100)));
        assert_eq!(resolved.gross_amount, Some(dec!(115)));
        assert_eq!(resolved.signed_gross_effect, Some(dec!(115)));
    }

    #[test]
    fn income_charges_cannot_reverse_an_authoritative_final_amount() {
        let mut dividend = inputs(ACTIVITY_TYPE_DIVIDEND);
        dividend.quantity = Some(dec!(1));
        dividend.unit_price = Some(dec!(10));
        dividend.amount = Some(dec!(100));
        dividend.fee = None;
        dividend.tax = Some(dec!(150));

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(dividend);

        assert_eq!(resolved.signed_cash_effect, Some(dec!(100)));
        assert_eq!(resolved.gross_amount, Some(dec!(250)));
    }

    #[test]
    fn final_trade_cash_reverse_derives_gross() {
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.amount = Some(dec!(23));
        let buy = ActivityEconomicsResolver::resolve_cash_inputs(buy);
        assert_eq!(buy.signed_cash_effect, Some(dec!(-23)));
        assert_eq!(buy.gross_amount, Some(dec!(20)));

        let mut sell = inputs(ACTIVITY_TYPE_SELL);
        sell.amount = Some(dec!(17));
        let sell = ActivityEconomicsResolver::resolve_cash_inputs(sell);
        assert_eq!(sell.signed_cash_effect, Some(dec!(17)));
        assert_eq!(sell.gross_amount, Some(dec!(20)));
    }

    #[test]
    fn direction_uses_economics_when_charges_exceed_proceeds() {
        let mut sell = inputs(ACTIVITY_TYPE_SELL);
        sell.quantity = Some(dec!(1));
        sell.unit_price = Some(dec!(10));
        sell.amount = Some(dec!(2));
        sell.fee = Some(dec!(12));
        sell.tax = None;

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(sell);

        assert_eq!(resolved.signed_cash_effect, Some(dec!(-2)));
        assert_eq!(resolved.gross_amount, Some(dec!(10)));
    }

    #[test]
    fn negative_sell_direction_survives_sub_cent_rounding() {
        // Same vector as the TS test "keeps the outflow direction within the
        // shared epsilon" in activity-utils.test.ts — keep them identical.
        let mut sell = inputs(ACTIVITY_TYPE_SELL);
        sell.quantity = Some(dec!(1));
        sell.unit_price = Some(dec!(10));
        sell.amount = Some(dec!(2.000000005));
        sell.fee = Some(dec!(12));
        sell.tax = None;

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(sell);

        assert_eq!(resolved.signed_cash_effect, Some(dec!(-2.000000005)));
    }

    #[test]
    fn inconsistent_sell_diagnostics_cannot_reverse_final_cash() {
        let mut sell = inputs(ACTIVITY_TYPE_SELL);
        sell.quantity = Some(dec!(1));
        sell.unit_price = Some(dec!(10));
        sell.amount = Some(dec!(100));
        sell.fee = Some(dec!(12));
        sell.tax = None;

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(sell);

        assert_eq!(resolved.signed_cash_effect, Some(dec!(100)));
        assert_eq!(resolved.gross_amount, Some(dec!(112)));
    }

    #[test]
    fn runtime_does_not_derive_missing_amount_and_preserves_explicit_zero() {
        let missing = ActivityEconomicsResolver::resolve_cash_inputs(inputs(ACTIVITY_TYPE_SELL));
        assert_eq!(missing.final_amount, None);
        assert_eq!(missing.signed_cash_effect, None);
        let mut explicit_zero = inputs(ACTIVITY_TYPE_SELL);
        explicit_zero.amount = Some(Decimal::ZERO);
        let explicit_zero = ActivityEconomicsResolver::resolve_cash_inputs(explicit_zero);
        assert_eq!(explicit_zero.final_amount, Some(Decimal::ZERO));
        assert_eq!(explicit_zero.signed_cash_effect, Some(Decimal::ZERO));
    }

    #[test]
    fn writer_derivation_is_explicit_and_multiplier_aware() {
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.unit_multiplier = dec!(100);

        assert_eq!(
            ActivityEconomicsResolver::calculate_trade_final_cash(buy),
            Some(dec!(2003))
        );
    }

    #[test]
    fn security_transfer_books_only_its_fee() {
        let mut transfer = inputs(ACTIVITY_TYPE_TRANSFER_IN);
        transfer.is_security_transfer = true;
        transfer.amount = Some(dec!(500));

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(transfer);

        assert_eq!(resolved.final_amount, Some(dec!(1)));
        assert_eq!(resolved.signed_cash_effect, Some(dec!(-1)));
        assert_eq!(resolved.gross_amount, Some(dec!(1)));
    }

    #[test]
    fn a_trade_gross_too_large_to_represent_derives_nothing() {
        // `rust_decimal` panics on overflow rather than saturating, and nothing
        // bounds quantity or unit price on the way in. A product we cannot
        // represent is not a figure to claim anything about, so it derives
        // nothing - the same answer a row with no quantity already gets.
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.quantity = Some(Decimal::MAX);
        buy.unit_price = Some(dec!(2));

        assert_eq!(
            ActivityEconomicsResolver::calculate_trade_final_cash(buy),
            None
        );
    }

    #[test]
    fn a_multiplier_that_overflows_the_trade_gross_derives_nothing() {
        // The quoted product fits; the contract multiplier is the third factor
        // that takes it out of range.
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.quantity = Some(Decimal::MAX);
        buy.unit_price = Some(dec!(1));
        buy.unit_multiplier = dec!(100);

        assert_eq!(
            ActivityEconomicsResolver::calculate_trade_final_cash(buy),
            None
        );
    }

    #[test]
    fn charges_that_overflow_a_representable_gross_derive_nothing() {
        // The gross itself is representable. Adding the buy's charges to it is
        // not, and that sum is the number actually being stored.
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.quantity = Some(Decimal::MAX);
        buy.unit_price = Some(dec!(1));
        buy.fee = Some(dec!(1));
        buy.tax = None;

        assert_eq!(
            ActivityEconomicsResolver::calculate_trade_final_cash(buy),
            None
        );
    }

    #[test]
    fn charges_too_large_to_total_derive_no_gross() {
        // Reverse-deriving gross from an authoritative final amount adds the
        // charges back on. Charges that cannot be totalled leave the stored
        // final cash untouched and simply yield no gross.
        let mut buy = inputs(ACTIVITY_TYPE_BUY);
        buy.amount = Some(dec!(100));
        buy.fee = Some(Decimal::MAX);
        buy.tax = Some(Decimal::MAX);

        let resolved = ActivityEconomicsResolver::resolve_cash_inputs(buy);

        assert_eq!(resolved.final_amount, Some(dec!(100)));
        assert_eq!(resolved.signed_cash_effect, Some(dec!(-100)));
        assert_eq!(resolved.gross_amount, None);
    }

    #[test]
    fn a_composite_gross_too_large_to_represent_derives_nothing() {
        // Same exposure on the DRIP/staking path, which multiplies the same
        // three factors.
        assert_eq!(
            ActivityEconomicsResolver::calculate_composite_final_cash(
                ACTIVITY_TYPE_DIVIDEND,
                Some(ACTIVITY_SUBTYPE_DRIP),
                Some(Decimal::MAX),
                Some(dec!(2)),
                Decimal::ONE,
            ),
            None
        );
    }

    #[test]
    fn a_lot_basis_too_large_to_represent_falls_back_like_a_zero_one() {
        // An unrepresentable price basis is no more usable than a zero one, so
        // it takes the same fallback: the transfer-in's stored amount.
        let mut transfer = stored_activity(ACTIVITY_TYPE_TRANSFER_IN);
        transfer.quantity = Some(Decimal::MAX);
        transfer.unit_price = Some(dec!(2));
        transfer.amount = Some(dec!(500));

        assert_eq!(
            ActivityEconomicsResolver::lot_cost_basis_value_with_unit_multiplier(
                &transfer,
                Decimal::ONE
            ),
            dec!(500)
        );
    }

    #[test]
    fn compiled_overflow_keeps_cash_and_gross_totals_unknown() {
        let mut staking = stored_activity(ACTIVITY_TYPE_INTEREST);
        staking.subtype = Some(ACTIVITY_SUBTYPE_STAKING_REWARD.to_string());
        staking.quantity = Some(Decimal::ONE);
        staking.unit_price = Some(Decimal::MAX);
        staking.amount = Some(Decimal::MAX);

        let resolved =
            ActivityEconomicsResolver::resolve_compiled_cash(&staking, Decimal::ONE, true).unwrap();
        assert_eq!(resolved.final_amount, Some(Decimal::MAX));
        assert_eq!(resolved.signed_cash_effect, None);
        assert_eq!(resolved.signed_gross_effect, None);

        let ordinary_account =
            ActivityEconomicsResolver::resolve_compiled_cash(&staking, Decimal::ONE, false)
                .unwrap();
        assert_eq!(ordinary_account.signed_cash_effect, Some(Decimal::ZERO));
        assert_eq!(ordinary_account.signed_gross_effect, Some(Decimal::ZERO));
    }

    #[test]
    fn compiled_gross_is_unknown_when_any_posting_gross_is_unknown() {
        let mut drip = stored_activity(ACTIVITY_TYPE_DIVIDEND);
        drip.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());
        drip.quantity = Some(Decimal::ONE);
        drip.unit_price = Some(Decimal::MAX);
        drip.amount = Some(Decimal::MAX);
        drip.fee = Some(Decimal::ONE);

        let resolved =
            ActivityEconomicsResolver::resolve_compiled_cash(&drip, Decimal::ONE, false).unwrap();

        assert_eq!(resolved.signed_cash_effect, Some(Decimal::ZERO));
        assert_eq!(resolved.signed_gross_effect, None);
    }

    #[test]
    fn overflowed_transfer_basis_is_unknown() {
        let mut transfer = stored_activity(ACTIVITY_TYPE_TRANSFER_IN);
        transfer.quantity = Some(Decimal::MAX);
        transfer.unit_price = Some(dec!(2));
        transfer.amount = None;
        let quote = Quote {
            close: Decimal::ONE,
            currency: "USD".to_string(),
            ..Default::default()
        };
        let resolved = ActivityEconomicsResolver::compile_activity_with_unit_multiplier(
            &transfer,
            Some(&quote),
            TransferBoundary::External,
            Decimal::ONE,
        );
        assert_eq!(resolved.lot_cost_basis_value, Decimal::ZERO);
        assert_eq!(resolved.basis_status, BasisStatus::Unknown);
        assert!(resolved
            .diagnostics
            .iter()
            .any(|message| message.contains("could not derive a usable cost basis")));

        transfer.amount = Some(dec!(500));
        let fallback = ActivityEconomicsResolver::compile_activity_with_unit_multiplier(
            &transfer,
            Some(&quote),
            TransferBoundary::External,
            Decimal::ONE,
        );
        assert_eq!(fallback.lot_cost_basis_value, dec!(500));
        assert_eq!(fallback.basis_status, BasisStatus::Complete);
    }

    #[test]
    fn a_transfer_market_value_too_large_to_represent_defers_to_cost_basis() {
        // A quote that cannot be multiplied out leaves the transfer exactly
        // where an absent quote leaves it.
        let mut transfer = stored_activity(ACTIVITY_TYPE_TRANSFER_IN);
        transfer.quantity = Some(Decimal::MAX);
        transfer.unit_price = Some(dec!(1));
        let quote = Quote {
            close: dec!(2),
            currency: "USD".to_string(),
            ..Default::default()
        };

        let compiled = ActivityEconomicsResolver::compile_activity_with_unit_multiplier(
            &transfer,
            Some(&quote),
            TransferBoundary::External,
            Decimal::ONE,
        );

        assert_eq!(
            compiled.performance_flow_source,
            ExternalFlowSource::CostBasisFallback
        );
        assert_eq!(compiled.performance_flow_value, Decimal::MAX);
    }

    #[test]
    fn bond_default_multiplier_pairs_with_provider_quote_convention() {
        // Market-data providers normalize bond quotes to FRACTION-of-par
        // (Boerse Frankfurt divides percent quotes by 100; the treasury
        // source emits fractions; matured-bond backfill writes par as 1.0).
        // The default multiplier must pair with that stored convention:
        // face qty x quote x multiplier = face-value dollars. A percent
        // default here would double-apply the /100 and value every existing
        // bond position at 1/100.
        let bond = Asset {
            instrument_type: Some(InstrumentType::Bond),
            ..Default::default()
        };
        let provider_quote = dec!(0.995);
        let face_qty = dec!(10_000);
        assert_eq!(
            face_qty * provider_quote * bond.contract_multiplier(),
            dec!(9_950)
        );
    }

    #[test]
    fn bond_with_explicit_multiplier_metadata_pairs_with_percent_quotes() {
        // Percent-of-par pricing is opt-in via asset metadata (the source of
        // truth), for bonds whose quotes are genuinely maintained in percent.
        let configured_bond = Asset {
            instrument_type: Some(InstrumentType::Bond),
            metadata: Some(serde_json::json!({ "contractMultiplier": "0.01" })),
            ..Default::default()
        };
        let percent_quote = dec!(99.5);
        assert_eq!(
            dec!(10_000) * percent_quote * configured_bond.contract_multiplier(),
            dec!(9_950)
        );

        // Any explicit value wins over the default.
        let custom = Asset {
            instrument_type: Some(InstrumentType::Bond),
            metadata: Some(serde_json::json!({ "contractMultiplier": "0.02" })),
            ..Default::default()
        };
        assert_eq!(custom.contract_multiplier(), dec!(0.02));
    }
}
