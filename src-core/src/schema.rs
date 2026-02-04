// @generated automatically by Diesel CLI.

diesel::table! {
    accounts (id) {
        id -> Text,
        name -> Text,
        account_type -> Text,
        group -> Nullable<Text>,
        currency -> Text,
        is_default -> Bool,
        is_active -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        platform_id -> Nullable<Text>,
    }
}

diesel::table! {
    activities (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Text,
        activity_type -> Text,
        activity_date -> Text,
        quantity -> Text,
        unit_price -> Text,
        currency -> Text,
        fee -> Text,
        amount -> Nullable<Text>,
        is_draft -> Bool,
        comment -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
        name -> Nullable<Text>,
        category_id -> Nullable<Text>,
        sub_category_id -> Nullable<Text>,
        event_id -> Nullable<Text>,
        recurrence -> Nullable<Text>,
    }
}

diesel::table! {
    activity_import_profiles (account_id) {
        account_id -> Text,
        field_mappings -> Text,
        activity_mappings -> Text,
        symbol_mappings -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        account_mappings -> Text,
    }
}

diesel::table! {
    activity_rules (id) {
        id -> Text,
        name -> Text,
        pattern -> Text,
        match_type -> Text,
        category_id -> Nullable<Text>,
        sub_category_id -> Nullable<Text>,
        activity_type -> Nullable<Text>,
        priority -> Integer,
        is_global -> Integer,
        account_id -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
        recurrence -> Nullable<Text>,
    }
}

diesel::table! {
    app_settings (setting_key) {
        setting_key -> Text,
        setting_value -> Text,
    }
}

diesel::table! {
    asset_class_targets (id) {
        id -> Text,
        strategy_id -> Text,
        asset_class -> Text,
        target_percent -> Float,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    assets (id) {
        id -> Text,
        isin -> Nullable<Text>,
        name -> Nullable<Text>,
        asset_type -> Nullable<Text>,
        symbol -> Text,
        symbol_mapping -> Nullable<Text>,
        asset_class -> Nullable<Text>,
        asset_sub_class -> Nullable<Text>,
        notes -> Nullable<Text>,
        countries -> Nullable<Text>,
        categories -> Nullable<Text>,
        classes -> Nullable<Text>,
        attributes -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        currency -> Text,
        data_source -> Text,
        sectors -> Nullable<Text>,
        url -> Nullable<Text>,
    }
}

diesel::table! {
    budget_allocations (id) {
        id -> Text,
        budget_config_id -> Text,
        category_id -> Text,
        amount -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    budget_config (id) {
        id -> Text,
        monthly_spending_target -> Text,
        monthly_income_target -> Text,
        currency -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    categories (id) {
        id -> Text,
        name -> Text,
        parent_id -> Nullable<Text>,
        color -> Nullable<Text>,
        icon -> Nullable<Text>,
        is_income -> Integer,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    contribution_limits (id) {
        id -> Text,
        group_name -> Text,
        contribution_year -> Integer,
        limit_amount -> Double,
        account_ids -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        start_date -> Nullable<Timestamp>,
        end_date -> Nullable<Timestamp>,
    }
}

diesel::table! {
    daily_account_valuation (id) {
        id -> Text,
        account_id -> Text,
        valuation_date -> Date,
        account_currency -> Text,
        base_currency -> Text,
        fx_rate_to_base -> Text,
        cash_balance -> Text,
        investment_market_value -> Text,
        total_value -> Text,
        cost_basis -> Text,
        net_contribution -> Text,
        calculated_at -> Text,
    }
}

diesel::table! {
    event_types (id) {
        id -> Text,
        name -> Text,
        color -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    events (id) {
        id -> Text,
        name -> Text,
        description -> Nullable<Text>,
        event_type_id -> Text,
        start_date -> Text,
        end_date -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    goal_contributions (id) {
        id -> Text,
        goal_id -> Text,
        account_id -> Text,
        amount -> Float,
        contributed_at -> Text,
    }
}

diesel::table! {
    goals (id) {
        id -> Text,
        title -> Text,
        description -> Nullable<Text>,
        target_amount -> Double,
        is_achieved -> Bool,
    }
}

diesel::table! {
    holding_targets (id) {
        id -> Text,
        asset_class_id -> Text,
        asset_id -> Text,
        target_percent_of_class -> Float,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    holdings_snapshots (id) {
        id -> Text,
        account_id -> Text,
        snapshot_date -> Date,
        currency -> Text,
        positions -> Text,
        cash_balances -> Text,
        cost_basis -> Text,
        net_contribution -> Text,
        calculated_at -> Text,
        net_contribution_base -> Text,
    }
}

diesel::table! {
    market_data_providers (id) {
        id -> Text,
        name -> Text,
        description -> Text,
        url -> Nullable<Text>,
        priority -> Integer,
        enabled -> Bool,
        logo_filename -> Nullable<Text>,
        last_synced_at -> Nullable<Text>,
        last_sync_status -> Nullable<Text>,
        last_sync_error -> Nullable<Text>,
    }
}

diesel::table! {
    platforms (id) {
        id -> Text,
        name -> Nullable<Text>,
        url -> Text,
    }
}

diesel::table! {
    quotes (id) {
        id -> Text,
        symbol -> Text,
        timestamp -> Text,
        open -> Text,
        high -> Text,
        low -> Text,
        close -> Text,
        adjclose -> Text,
        volume -> Text,
        currency -> Text,
        data_source -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    rebalancing_strategies (id) {
        id -> Text,
        name -> Text,
        account_id -> Nullable<Text>,
        is_active -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(activities -> accounts (account_id));
diesel::joinable!(activities -> events (event_id));
diesel::joinable!(activity_rules -> accounts (account_id));
diesel::joinable!(asset_class_targets -> rebalancing_strategies (strategy_id));
diesel::joinable!(budget_allocations -> budget_config (budget_config_id));
diesel::joinable!(budget_allocations -> categories (category_id));
diesel::joinable!(events -> event_types (event_type_id));
diesel::joinable!(goal_contributions -> accounts (account_id));
diesel::joinable!(goal_contributions -> goals (goal_id));
diesel::joinable!(holding_targets -> asset_class_targets (asset_class_id));
diesel::joinable!(holding_targets -> assets (asset_id));
diesel::joinable!(quotes -> assets (symbol));
diesel::joinable!(rebalancing_strategies -> accounts (account_id));

diesel::allow_tables_to_appear_in_same_query!(
    accounts,
    activities,
    activity_import_profiles,
    activity_rules,
    app_settings,
    asset_class_targets,
    assets,
    budget_allocations,
    budget_config,
    categories,
    contribution_limits,
    daily_account_valuation,
    event_types,
    events,
    goal_contributions,
    goals,
    holding_targets,
    holdings_snapshots,
    market_data_providers,
    platforms,
    quotes,
    rebalancing_strategies,
);
