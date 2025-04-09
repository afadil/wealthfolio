// @generated automatically by Diesel CLI.

diesel::table! {
    cash_holdings (id) {
        id -> Text,
        account_id -> Text,
        currency -> Text,
        amount -> Text,
        last_updated -> Text,
    }
}

diesel::table! {
    lots (id) {
        id -> Text,
        position_id -> Text,
        acquisition_date -> Text,
        quantity -> Text,
        cost_basis -> Text,
        acquisition_price -> Text,
        acquisition_fees -> Text,
        last_updated -> Text,
    }
}

diesel::table! {
    positions (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Text,
        currency -> Text,
        quantity -> Text,
        average_cost -> Text,
        total_cost_basis -> Text,
        inception_date -> Text,
        last_updated -> Text,
    }
}

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
        activity_date -> Timestamp,
        quantity -> Text,
        unit_price -> Text,
        currency -> Text,
        fee -> Text,
        amount -> Nullable<Text>,
        is_draft -> Bool,
        comment -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
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
    }
}

diesel::table! {
    app_settings (setting_key) {
        setting_key -> Text,
        setting_value -> Text,
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
    goals (id) {
        id -> Text,
        title -> Text,
        description -> Nullable<Text>,
        target_amount -> Double,
        is_achieved -> Bool,
    }
}

diesel::table! {
    goals_allocation (id) {
        id -> Text,
        percent_allocation -> Integer,
        goal_id -> Text,
        account_id -> Text,
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
    portfolio_history (id) {
        id -> Text,
        account_id -> Text,
        date -> Text,
        total_value -> Text,
        market_value -> Text,
        book_cost -> Text,
        available_cash -> Text,
        net_deposit -> Text,
        currency -> Text,
        base_currency -> Text,
        total_gain_value -> Text,
        total_gain_percentage -> Text,
        day_gain_percentage -> Text,
        day_gain_value -> Text,
        allocation_percentage -> Text,
        exchange_rate -> Text,
        holdings -> Nullable<Text>,
        calculated_at -> Timestamp,
    }
}

diesel::table! {
    quotes (id) {
        id -> Text,
        symbol -> Text,
        date -> Timestamp,
        open -> Text,
        high -> Text,
        low -> Text,
        close -> Text,
        adjclose -> Text,
        volume -> Text,
        currency -> Text,
        data_source -> Text,
        created_at -> Timestamp,
    }
}

diesel::joinable!(lots -> positions (position_id));
diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(goals_allocation -> accounts (account_id));
diesel::joinable!(goals_allocation -> goals (goal_id));
diesel::joinable!(quotes -> assets (symbol));

diesel::allow_tables_to_appear_in_same_query!(
    cash_holdings,
    lots,
    positions,
    accounts,
    activities,
    activity_import_profiles,
    app_settings,
    assets,
    contribution_limits,
    goals,
    goals_allocation,
    platforms,
    portfolio_history,
    quotes,
);
