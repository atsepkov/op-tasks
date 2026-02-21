# op-tasks — Lightweight SQLite Issue Tracker

## Overview

Bun TypeScript CLI using `bun:sqlite`. Two tables (issues + dependencies), no daemon, no sync. Designed for solo-dev repos and agent orchestration.

## Architecture

```
src/
  index.ts          # CLI entry point (arg parsing + command dispatch)
  db.ts             # Database: open, schema, migration
  commands.ts       # All command implementations
  types.ts          # Issue interface, status maps
  json.ts           # JSON serialization (status char→word, dependencies)
  commands.test.ts  # Tests (colocated)
schema.sql          # Single source of truth for DB schema
bin/
  op-tasks          # Bun shebang launcher
  op-tasks.bash     # Old bash version (reference)
```

- DB lives at `<git-root>/.op-tasks/issues.db` per repo
- Auto-creates `.op-tasks/` and adds to `.gitignore` on first use

## Tech Stack

- **Runtime:** Bun (runs TypeScript directly)
- **Database:** `bun:sqlite` (WAL mode, parameterized queries)
- **Linting:** Biome (tabs, 100 width)
- **Testing:** `bun test`
- **Runtime dependencies:** Zero

## Development

```bash
bun test                    # Run tests
bun run lint                # Biome check
bun run typecheck           # tsc --noEmit
```

## Conventions

- Zero runtime npm dependencies — only `bun:sqlite` and Node built-ins
- `noUncheckedIndexedAccess` enabled — always handle possible `undefined`
- `noExplicitAny` enforced via Biome
- Parameterized SQL queries everywhere (no string interpolation for values)
- Labels are free-form strings (default: task)
- Statuses: ` `=open, `/`=in_progress, `x`=done, `-`=cancelled, `!`=blocked, `?`=unsure
- All data commands support `--json` for machine-readable output
