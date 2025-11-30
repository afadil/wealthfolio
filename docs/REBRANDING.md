# Wealthfolio → WealthVN Rebranding Plan

**Date**: November 30, 2025  
**Status**: Complete

## Overview

This document tracks the rebranding of "Wealthfolio" to "WealthVN" for the
Vietnamese market.

## New Brand Identity

| Field                 | Old Value                     | New Value                           |
| --------------------- | ----------------------------- | ----------------------------------- |
| **App Name**          | Wealthfolio                   | WealthVN                            |
| **Bundle ID**         | com.teymz.wealthfolio         | com.wealthvn.app                    |
| **Package Prefix**    | @wealthfolio/                 | @wealthvn/                          |
| **Rust Crate Prefix** | wealthfolio\_                 | wealthvn\_                          |
| **GitHub Repo**       | github.com/afadil/wealthfolio | github.com/chipheo00/vn-wealthfolio |
| **Website**           | wealthfolio.app               | Disabled                            |
| **Author/Team**       | Aziz Fadil / Teymz Inc.       | Chipheo00 - CFPM Inc. WealthVN Team |
| **Auto-updater**      | Enabled                       | Disabled (track via git releases)   |
| **Addon Store**       | wealthfolio.app/api/addons    | Disabled                            |

---

## Execution Phases

### Phase 1: Core Identity (CRITICAL)

- [x] Update Rust Cargo.toml files (src-core, src-tauri, src-server)
- [x] Update root package.json and workspace packages
- [x] Update tauri.conf.json (productName, identifier, disable updater)
- [x] Update iOS/macOS project.yml and rename directories

### Phase 2: Import Paths

- [x] Global replace @wealthfolio/_ imports to @wealthvn/_
- [x] Update tsconfig.json and vite.config.ts paths

### Phase 3: UI & Localization

- [x] Update localization files (en/_.json, vi/_.json)

### Phase 4: Docker & Server

- [x] Update Dockerfile and environment files

### Phase 5: External References

- [x] Update/disable external URLs (addon store, website links)
- [x] Update GitHub repo URLs and author info

### Phase 6: Documentation

- [x] Update README.md and documentation files

### Phase 7: Verification

- [x] Verify build compiles (pnpm build, cargo check)

---

## Files Changed

### Cargo.toml Files

- `src-core/Cargo.toml`
- `src-tauri/Cargo.toml`
- `src-server/Cargo.toml`

### Package.json Files

- `package.json` (root)
- `packages/addon-sdk/package.json`
- `packages/ui/package.json`
- `packages/addon-dev-tools/package.json`
- `addons/goal-progress-tracker/package.json`
- `addons/investment-fees-tracker/package.json`
- `addons/swingfolio-addon/package.json`

### Tauri & Apple Config

- `src-tauri/tauri.conf.json`
- `src-tauri/gen/apple/project.yml`
- `src-tauri/gen/apple/wealthvn-app_iOS/` (renamed)
- `src-tauri/gen/apple/wealthvn-app.xcodeproj/` (renamed)

### Addon Vite Configs (Phase 7 fix)

- `addons/goal-progress-tracker/vite.config.ts`
- `addons/investment-fees-tracker/vite.config.ts`
- `addons/swingfolio-addon/vite.config.ts`

### Localization

- `src/locales/en/common.json`
- `src/locales/en/settings.json`
- `src/locales/en/onboarding.json`
- `src/locales/vi/common.json`
- `src/locales/vi/settings.json`
- `src/locales/vi/onboarding.json`

### Docker & Environment

- `Dockerfile`
- `.env.example`
- `.env.web.example`

### Documentation

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/addons/*.md`

---

## Notes

- Logo and icon assets should be replaced separately with new WealthVN branding
- Database migration: existing users' database files will continue to work
- The app will look for the same database path, just with different app identity

---

## Post-Rebranding Checklist

- [ ] Replace logo files (`public/logo.svg`, `public/logo.png`)
- [ ] Regenerate app icons for all platforms (`src-tauri/icons/`)
- [ ] Update iOS assets (`src-tauri/gen/apple/Assets.xcassets/`)
- [ ] Run `pnpm install` to update lockfile
- [ ] Run `pnpm build` to verify frontend builds
- [ ] Run `cargo check` to verify Rust compiles
- [ ] Test `pnpm tauri dev` for desktop app
- [ ] Commit and push to new repository

---

## Changelog

| Date       | Phase     | Status   | Notes                                          |
| ---------- | --------- | -------- | ---------------------------------------------- |
| 2025-11-30 | Planning  | Complete | Rebranding plan created                        |
| 2025-11-30 | Phase 1-6 | Complete | All rebranding changes applied                 |
| 2025-11-30 | Phase 7   | Complete | Build verified (pnpm build + cargo check pass) |
