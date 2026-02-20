# op-tasks

Lightweight SQLite issue tracker. Single Bash script, one table, no daemon.

## Install

```bash
# Symlink into PATH
ln -s ~/work/personal/op-tasks/bin/op-tasks ~/.local/bin/op-tasks
```

## Usage

```bash
op-tasks add "fix login bug" -l bug        # Create issue
op-tasks add "dark mode" -l feature         # Create with label
op-tasks list                               # List open issues
op-tasks list --all                         # Include closed
op-tasks list --label bug                   # Filter by label
op-tasks show 3                             # Show by ID
op-tasks show "login"                       # Show by title substring
op-tasks close 3                            # Close issue
op-tasks reopen 3                           # Reopen issue
op-tasks edit 3 -t "new title" -l feature   # Edit title/label
op-tasks ready                              # Next open issue (lowest ID)
```

## Storage

DB lives at `<git-root>/.op-tasks/issues.db`. Auto-created on first command. `.op-tasks/` is auto-added to `.gitignore`.

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
op-tasks migrate    # One-time import from .beads/beads.db
```

## Labels

`bug` | `feature` | `polish` | `techdebt`
