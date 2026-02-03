# `AI-POC-COPY/` Policy (Reference Only)

`AI-POC-COPY/` exists to validate feasibility and preserve historical context.
It will be deleted later.

## Allowed use

- Behavior reference: “what should happen”
- Edge cases and pitfalls to avoid
- Small, isolated snippets **only after** refactoring them into repo conventions
  and adding tests

## Not allowed

- Copying folder/module structure into `src-front/`, `crates/`, `src-tauri/`,
  `src-server/`
- Importing PoC code into production paths
- Adding dependencies “because PoC used them” without re-justifying in the
  current repo

## Process (quality gate)

1. Implement using current repo patterns first.
2. Consult PoC only to confirm behavior or catch edge cases.
3. If porting a snippet, write a test that fixes the behavior, then refactor to
   match repo style.
