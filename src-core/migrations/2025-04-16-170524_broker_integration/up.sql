-- migrations/20250416_add_accounts_fields/up.sql

-- Add new columns to the existing accounts table.
ALTER TABLE "accounts" ADD COLUMN "is_api_integrations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN "broker" TEXT;
ALTER TABLE "accounts" ADD COLUMN "broker_api" VARBINARY(512);
ALTER TABLE "accounts" ADD COLUMN "broker_extra" VARBINARY(512);

 -- Consider using 256 bytes (depending on the max size of the encrypted API keys)
 -- For now I will stick to the 512 bytes just in case in the future we have a big API key to be stored.
