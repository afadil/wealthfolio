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
        account_number -> Nullable<Text>,
        meta -> Nullable<Text>,
        provider -> Nullable<Text>,
        provider_account_id -> Nullable<Text>,
        is_archived -> Bool,
        tracking_mode -> Text,
    }
}

diesel::table! {
    activities (id) {
        id -> Text,
        account_id -> Text,
        asset_id -> Nullable<Text>,
        activity_type -> Text,
        activity_type_override -> Nullable<Text>,
        source_type -> Nullable<Text>,
        subtype -> Nullable<Text>,
        status -> Text,
        activity_date -> Text,
        settlement_date -> Nullable<Text>,
        quantity -> Nullable<Text>,
        unit_price -> Nullable<Text>,
        amount -> Nullable<Text>,
        fee -> Nullable<Text>,
        currency -> Text,
        fx_rate -> Nullable<Text>,
        notes -> Nullable<Text>,
        metadata -> Nullable<Text>,
        source_system -> Nullable<Text>,
        source_record_id -> Nullable<Text>,
        source_group_id -> Nullable<Text>,
        idempotency_key -> Nullable<Text>,
        import_run_id -> Nullable<Text>,
        is_user_modified -> Integer,
        needs_review -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    activity_import_profiles (account_id) {
        account_id -> Text,
        name -> Text,
        config -> Text,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    ai_messages (id) {
        id -> Text,
        thread_id -> Text,
        role -> Text,
        content_json -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    ai_thread_tags (id) {
        id -> Text,
        thread_id -> Text,
        tag -> Text,
        created_at -> Text,
    }
}

diesel::table! {
    ai_threads (id) {
        id -> Text,
        title -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
        config_snapshot -> Nullable<Text>,
        is_pinned -> Integer,
    }
}

diesel::table! {
    app_settings (setting_key) {
        setting_key -> Text,
        setting_value -> Text,
    }
}

diesel::table! {
    asset_taxonomy_assignments (id) {
        id -> Text,
        asset_id -> Text,
        taxonomy_id -> Text,
        category_id -> Text,
        weight -> Integer,
        source -> Text,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    assets (id) {
        id -> Text,
        kind -> Text,
        name -> Nullable<Text>,
        symbol -> Text,
        exchange_mic -> Nullable<Text>,
        currency -> Text,
        pricing_mode -> Text,
        preferred_provider -> Nullable<Text>,
        provider_overrides -> Nullable<Text>,
        notes -> Nullable<Text>,
        metadata -> Nullable<Text>,
        is_active -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    brokers_sync_state (account_id, provider) {
        account_id -> Text,
        provider -> Text,
        checkpoint_json -> Nullable<Text>,
        last_attempted_at -> Nullable<Text>,
        last_successful_at -> Nullable<Text>,
        last_error -> Nullable<Text>,
        last_run_id -> Nullable<Text>,
        sync_status -> Text,
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
    goals (id) {
        id -> Text,
        title -> Text,
        description -> Nullable<Text>,
        target_amount -> Double,
        is_achieved -> Bool,
    }
}

diesel::table! {
    health_issue_dismissals (issue_id) {
        issue_id -> Text,
        dismissed_at -> Text,
        data_hash -> Text,
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
        cash_total_account_currency -> Text,
        cash_total_base_currency -> Text,
        source -> Text,
    }
}

diesel::table! {
    import_runs (id) {
        id -> Text,
        account_id -> Text,
        source_system -> Text,
        run_type -> Text,
        mode -> Text,
        status -> Text,
        started_at -> Text,
        finished_at -> Nullable<Text>,
        review_mode -> Text,
        applied_at -> Nullable<Text>,
        checkpoint_in -> Nullable<Text>,
        checkpoint_out -> Nullable<Text>,
        summary -> Nullable<Text>,
        warnings -> Nullable<Text>,
        error -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
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
        external_id -> Nullable<Text>,
        kind -> Text,
        website_url -> Nullable<Text>,
        logo_url -> Nullable<Text>,
    }
}

diesel::table! {
    quote_sync_state (asset_id) {
        asset_id -> Text,
        position_closed_date -> Nullable<Text>,
        last_synced_at -> Nullable<Text>,
        data_source -> Text,
        sync_priority -> Integer,
        error_count -> Integer,
        last_error -> Nullable<Text>,
        profile_enriched_at -> Nullable<Text>,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    quotes (id) {
        id -> Text,
        asset_id -> Text,
        day -> Text,
        source -> Text,
        open -> Nullable<Text>,
        high -> Nullable<Text>,
        low -> Nullable<Text>,
        close -> Text,
        adjclose -> Nullable<Text>,
        volume -> Nullable<Text>,
        currency -> Text,
        notes -> Nullable<Text>,
        created_at -> Text,
        timestamp -> Text,
    }
}

diesel::table! {
    taxonomies (id) {
        id -> Text,
        name -> Text,
        color -> Text,
        description -> Nullable<Text>,
        is_system -> Integer,
        is_single_select -> Integer,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::table! {
    taxonomy_categories (id, taxonomy_id) {
        id -> Text,
        taxonomy_id -> Text,
        parent_id -> Nullable<Text>,
        name -> Text,
        key -> Text,
        color -> Text,
        description -> Nullable<Text>,
        sort_order -> Integer,
        created_at -> Text,
        updated_at -> Text,
    }
}

diesel::joinable!(accounts -> platforms (platform_id));
diesel::joinable!(activities -> accounts (account_id));
diesel::joinable!(activities -> assets (asset_id));
diesel::joinable!(activities -> import_runs (import_run_id));
diesel::joinable!(ai_messages -> ai_threads (thread_id));
diesel::joinable!(ai_thread_tags -> ai_threads (thread_id));
diesel::joinable!(asset_taxonomy_assignments -> assets (asset_id));
diesel::joinable!(brokers_sync_state -> accounts (account_id));
diesel::joinable!(brokers_sync_state -> import_runs (last_run_id));
diesel::joinable!(goals_allocation -> accounts (account_id));
diesel::joinable!(goals_allocation -> goals (goal_id));
diesel::joinable!(import_runs -> accounts (account_id));
diesel::joinable!(quotes -> assets (asset_id));
diesel::joinable!(taxonomy_categories -> taxonomies (taxonomy_id));

diesel::allow_tables_to_appear_in_same_query!(
    accounts,
    activities,
    activity_import_profiles,
    ai_messages,
    ai_thread_tags,
    ai_threads,
    app_settings,
    asset_taxonomy_assignments,
    assets,
    brokers_sync_state,
    contribution_limits,
    daily_account_valuation,
    goals,
    goals_allocation,
    health_issue_dismissals,
    holdings_snapshots,
    import_runs,
    market_data_providers,
    platforms,
    quote_sync_state,
    quotes,
    taxonomies,
    taxonomy_categories,
);
