CREATE TABLE csv_import_profiles (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    account_id TEXT NOT NULL
);

CREATE TABLE csv_column_mappings (
    profile_id TEXT NOT NULL,
    csv_column_name TEXT NOT NULL,
    app_field_name TEXT NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES csv_import_profiles(id)
);

CREATE TABLE csv_transaction_type_mappings (
    profile_id TEXT NOT NULL,
    csv_transaction_type TEXT NOT NULL,
    app_activity_type TEXT NOT NULL,
    FOREIGN KEY(profile_id) REFERENCES csv_import_profiles(id)
);
