# leads

Lightweight SQLite issue tracker. Single Bash script, one table, no daemon.

## Install

```bash
# Symlink into PATH
ln -s ~/work/personal/leads/bin/leads ~/.local/bin/leads
```

## Usage

```bash
leads add "fix login bug" -l bug        # Create issue
leads add "dark mode" -l feature         # Create with label
leads list                               # List open issues
leads list --all                         # Include closed
leads list --label bug                   # Filter by label
leads show 3                             # Show by ID
leads show "login"                       # Show by title substring
leads close 3                            # Close issue
leads reopen 3                           # Reopen issue
leads edit 3 -t "new title" -l feature   # Edit title/label
leads ready                              # Next open issue (lowest ID)
```

## Storage

DB lives at `<git-root>/.leads/issues.db`. Auto-created on first command. `.leads/` is auto-added to `.gitignore`.

## Schema

```sql
CREATE TABLE issues (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    label    TEXT NOT NULL DEFAULT 'bug'
                CHECK(label IN ('bug', 'feature', 'polish', 'techdebt')),
    status   TEXT NOT NULL DEFAULT 'open'
                CHECK(status IN ('open', 'closed')),
    created  TEXT NOT NULL DEFAULT (datetime('now')),
    closed   TEXT,
    beads_id TEXT
);
```

## Migration from Beads

```bash
leads migrate    # One-time import from .beads/beads.db
```

## Labels

`bug` | `feature` | `polish` | `techdebt`
