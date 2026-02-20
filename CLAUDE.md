# op-tasks — Lightweight SQLite Issue Tracker

## Overview

Single Bash script wrapping `sqlite3`. One table, no daemon, no sync. Designed for solo-dev repos.

## Architecture

- `bin/op-tasks` — the CLI (Bash, ~250 lines)
- `schema.sql` — single source of truth for DB schema
- DB lives at `<git-root>/.op-tasks/issues.db` per repo

## Development

Test changes by running `op-tasks` commands in any git repo. The script auto-inits `.op-tasks/` on first use.

Schema changes go in `schema.sql` — the CLI reads it on init.

## Conventions

- Keep it under 300 lines of Bash
- No external dependencies beyond `sqlite3` and standard Unix tools
- All SQL uses parameterized queries where possible (sqlite3 positional args)
- Labels are constrained by CHECK: bug, feature, polish, techdebt
- Status is binary: open or closed
