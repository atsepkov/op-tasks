# op-tasks

Lightweight SQLite issue tracker for agentic swarms. A simpler alternative to [beads](https://github.com/steveyegge/beads) — designed to integrate with [obsidian-plus](https://github.com/atsepkov/obsidian-plus) for swarm orchestration, but works standalone in any git repo. Bun TypeScript, one file DB, `--json` on everything. ~700 LOC, zero runtime dependencies.

## Install

Requires [Bun](https://bun.sh).

```bash
# Symlink into PATH
ln -s ~/work/personal/op-tasks/bin/op-tasks ~/.local/bin/op-tasks
```

## Usage

```bash
op-tasks add "fix login bug" -l bug                 # Create issue
op-tasks add "dark mode" -l feature -p 2             # Priority 2
op-tasks add "refactor auth" --description "..."     # With description
op-tasks list                                        # List open issues
op-tasks list --all                                  # Include closed/cancelled
op-tasks list --label bug                            # Filter by label
op-tasks list --json                                 # Machine-readable output
op-tasks show 3                                      # Show by ID
op-tasks show "login"                                # Show by title substring
op-tasks close 3                                     # Close (done)
op-tasks close 3 --resolution "fixed in abc123"      # Close with resolution
op-tasks reopen 3                                    # Reopen issue
op-tasks status 3 in_progress                        # Set status
op-tasks status 3 blocked                            # Mark blocked
op-tasks edit 3 -t "new title" -l feature            # Edit title/label
op-tasks edit 3 -p 1 --description "updated desc"   # Edit priority/description
op-tasks ready                                       # Next open issue (lowest ID)
op-tasks block 3 5                                   # Issue 3 blocks issue 5
op-tasks unblock 3 5                                 # Remove dependency
op-tasks migrate                                     # One-time import from beads
```

### JSON output

Every data command supports `--json`:

```bash
$ op-tasks show 1 --json
{
  "id": 1,
  "title": "fix login bug",
  "label": "bug",
  "status": "open",
  "priority": 0,
  "description": null,
  "resolution": null,
  "created": "2025-01-15 10:30:00",
  "closed": null,
  "blocks": [],
  "blockedBy": []
}
```

## Storage

DB lives at `<git-root>/.op-tasks/issues.db`. Auto-created on first command. `.op-tasks/` is auto-added to the project's `.gitignore`.

## Schema

```sql
CREATE TABLE issues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT 'task',
    status      TEXT NOT NULL DEFAULT ' '
                   CHECK(status IN (' ', '/', 'x', '-', '!', '?')),
    priority    INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    resolution  TEXT,
    created     TEXT NOT NULL DEFAULT (datetime('now')),
    closed      TEXT
);

CREATE TABLE dependencies (
    blocker  INTEGER NOT NULL REFERENCES issues(id),
    blocked  INTEGER NOT NULL REFERENCES issues(id),
    PRIMARY KEY (blocker, blocked),
    CHECK(blocker != blocked)
);
```

## Status codes

| Char | Word | Meaning |
|------|------|---------|
| ` ` | `open` | Default. Ready for work |
| `/` | `in_progress` | Actively being worked on |
| `x` | `done` | Completed |
| `-` | `cancelled` | Won't do |
| `!` | `blocked` | Waiting on something |
| `?` | `unsure` | Needs triage |

Use either form with `op-tasks status`: `op-tasks status 3 /` or `op-tasks status 3 in_progress`.

## Labels

Free-form strings. Default: `task`. Common: `bug`, `feature`, `polish`, `techdebt`.

## Why Bun

Go is faster. Rust is faster still. But the bottleneck for a CLI issue tracker is database access, not language speed. Every command hits SQLite — open, query, close. That I/O dominates.

Bun's `bun:sqlite` runs WAL mode with busy timeouts and parameterized queries. It's fast enough that the language overhead is noise. What you get in return: no compile step, TypeScript directly, and ~700 lines that any agent can read and modify.

## Comparison

| | op-tasks | [trekker](https://github.com/obsfx/trekker) | [beads (bd)](https://github.com/steveyegge/beads) | [beads_rust (br)](https://github.com/Dicklesworthstone/beads_rust) |
|---|---|---|---|---|
| Language | TypeScript (Bun) | TypeScript (Bun) | Go | Rust |
| Source | ~700 LOC | ~5K LOC | ~200K LOC | ~20K LOC |
| Runtime deps | 0 | 0 | 0 (compiled) | 0 (compiled) |
| Storage | SQLite | SQLite | Git (JSONL) + SQLite | SQLite + JSONL |
| JSON output | `--json` | custom `--toon` | `--json` | `--json` |
| Sync | None (local) | None (local) | Git push/pull | Git push/pull |
| Web UI | No | Dashboard | No | No |

## Migration from Beads

```bash
op-tasks migrate    # One-time import from .beads/beads.db
```
