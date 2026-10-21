# Updater dependency security backport

This directory contains runtime/build files from the published
tauri-plugin-updater 2.10.1 crate (archive SHA-256
`806d9dac662c2e4594ff03c647a552f2c9bd544e7d0f683ec58f872f952ce4af`).
Its Windows ZIP dependency is upgraded from version 4 to version 9 in both
Cargo manifests. Source and license files retain their original bytes;
development assets and the archive's separate lockfile are omitted.

The same dependency change was applied by upstream tauri-apps/plugins-workspace
in commit ba98bfadc4c8 (2026-10-16, upstream pull request #3698). The published
updater API and existing verification behavior are preserved. Remove this
patch when a released updater includes that fix.
