#!/usr/bin/env bash
set -euo pipefail

# op-tasks — lightweight SQLite issue tracker
# Usage: op-tasks <command> [args]

# Resolve symlinks to find the real script location (macOS-compatible)
_resolve() {
    local f="$1"
    while [[ -L "$f" ]]; do
        local dir="$(cd "$(dirname "$f")" && pwd)"
        f="$(readlink "$f")"
        [[ "$f" != /* ]] && f="$dir/$f"
    done
    echo "$f"
}
SCHEMA_DIR="$(cd "$(dirname "$(_resolve "$0")")/.." && pwd)"

# ── Helpers ──────────────────────────────────────────────────────────────────

die()  { printf 'error: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }

find_git_root() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        [[ -d "$dir/.git" ]] && echo "$dir" && return
        dir="$(dirname "$dir")"
    done
    die "not inside a git repository"
}

db_path() {
    local root
    root="$(find_git_root)"
    echo "$root/.op-tasks/issues.db"
}

ensure_db() {
    local db root
    root="$(find_git_root)"
    db="$root/.op-tasks/issues.db"

    if [[ ! -f "$db" ]]; then
        mkdir -p "$root/.op-tasks"
        sqlite3 "$db" < "$SCHEMA_DIR/schema.sql" >/dev/null 2>&1

        # Append .op-tasks/ to .gitignore if not already there
        local gi="$root/.gitignore"
        if [[ -f "$gi" ]]; then
            grep -qxF '.op-tasks/' "$gi" 2>/dev/null || echo '.op-tasks/' >> "$gi"
        else
            echo '.op-tasks/' > "$gi"
        fi
    fi

    echo "$db"
}

sql() {
    local db="$1"; shift
    sqlite3 -batch -noheader -list "$db" "$@"
}

# Escape a value for safe SQL string interpolation (double single quotes)
sql_escape() {
    printf '%s' "$1" | sed "s/'/''/g"
}

sql_display() {
    local db="$1"; shift
    sqlite3 -batch -header -column "$db" "$@"
}

# Map word aliases to single-char statuses
status_char() {
    case "$1" in
        ' '|open)        echo ' ' ;;
        /|in-progress)   echo '/' ;;
        x|done|closed)   echo 'x' ;;
        -|cancelled)     echo '-' ;;
        '!'|blocked)     echo '!' ;;
        '?'|unsure)      echo '?' ;;
        *) die "invalid status: $1 (use: open / done cancelled blocked unsure)" ;;
    esac
}

# Human-readable label for a status char
status_label() {
    case "$1" in
        ' ') echo 'open' ;;
        /)   echo 'in-progress' ;;
        x)   echo 'done' ;;
        -)   echo 'cancelled' ;;
        '!') echo 'blocked' ;;
        '?') echo 'unsure' ;;
        *)   echo "$1" ;;
    esac
}

# Resolve an argument to an issue ID.
# If numeric, use directly. Otherwise, case-insensitive substring match on title.
resolve_id() {
    local db="$1" arg="$2" status_filter="${3:-}"

    if [[ "$arg" =~ ^[0-9]+$ ]]; then
        echo "$arg"
        return
    fi

    # Escape single quotes for SQL
    local escaped
    escaped="$(sql_escape "$arg")"
    local where="title LIKE '%${escaped}%' COLLATE NOCASE"
    [[ -n "$status_filter" ]] && where="$where AND status = '$status_filter'"

    local matches
    matches="$(sql "$db" "SELECT id, title FROM issues WHERE $where;")"

    local count=0
    if [[ -n "$matches" ]]; then
        count="$(echo "$matches" | wc -l | tr -d ' ')"
    fi

    if [[ "$count" -eq 0 ]]; then
        die "no issue matching '$arg'"
    elif [[ "$count" -eq 1 ]]; then
        echo "$matches" | cut -d'|' -f1
    else
        printf 'Multiple matches for "%s":\n' "$arg" >&2
        echo "$matches" | while IFS='|' read -r mid mtitle; do
            printf '  #%-4s %s\n' "$mid" "$mtitle" >&2
        done
        exit 1
    fi
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_init() {
    local db
    db="$(ensure_db)"
    info "Initialized $(db_path)"
}

cmd_add() {
    local title="" label="bug"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -l|--label) label="$2"; shift 2 ;;
            -*) die "unknown flag: $1" ;;
            *)  title="$1"; shift ;;
        esac
    done
    [[ -z "$title" ]] && die "usage: op-tasks add \"title\" [-l label]"

    local db
    db="$(ensure_db)"
    local id etitle elabel
    etitle="$(sql_escape "$title")"
    elabel="$(sql_escape "$label")"
    id="$(sql "$db" "INSERT INTO issues (title, label) VALUES ('$etitle', '$elabel') RETURNING id;")"
    info "#$id $title [$label]"
}

cmd_list() {
    local label="" show_all=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --label|-l) label="$2"; shift 2 ;;
            --all|-a) show_all=1; shift ;;
            -*) die "unknown flag: $1" ;;
            *) die "unexpected argument: $1" ;;
        esac
    done

    local db
    db="$(ensure_db)"

    local where="1=1"
    [[ "$show_all" -eq 0 ]] && where="status NOT IN ('x', '-')"
    [[ -n "$label" ]] && where="$where AND label = '$label'"

    sql_display "$db" "SELECT id, label,
        CASE status
            WHEN ' ' THEN 'open'
            WHEN '/' THEN 'in-progress'
            WHEN 'x' THEN 'done'
            WHEN '-' THEN 'cancelled'
            WHEN '!' THEN 'blocked'
            WHEN '?' THEN 'unsure'
            ELSE status
        END AS status,
        substr(title, 1, 60) AS title
    FROM issues WHERE $where ORDER BY id;"
}

cmd_show() {
    [[ $# -lt 1 ]] && die "usage: op-tasks show <id-or-title>"
    local db
    db="$(ensure_db)"
    local id
    id="$(resolve_id "$db" "$1")"
    sql_display "$db" "SELECT * FROM issues WHERE id = $id;"

    # Show deps
    local blockers blocked
    blockers="$(sql "$db" "SELECT d.blocker, i.title FROM deps d JOIN issues i ON i.id = d.blocker WHERE d.blocked = $id;")"
    blocked="$(sql "$db" "SELECT d.blocked, i.title FROM deps d JOIN issues i ON i.id = d.blocked WHERE d.blocker = $id;")"

    if [[ -n "$blockers" ]]; then
        printf '\nBlocked by:\n'
        echo "$blockers" | while IFS='|' read -r bid btitle; do
            printf '  #%-4s %s\n' "$bid" "$btitle"
        done
    fi
    if [[ -n "$blocked" ]]; then
        printf '\nBlocks:\n'
        echo "$blocked" | while IFS='|' read -r bid btitle; do
            printf '  #%-4s %s\n' "$bid" "$btitle"
        done
    fi
}

cmd_close() {
    [[ $# -lt 1 ]] && die "usage: op-tasks close <id-or-title>"
    local db
    db="$(ensure_db)"
    local id
    id="$(resolve_id "$db" "$1")"
    sql "$db" "UPDATE issues SET status = 'x', closed = datetime('now') WHERE id = $id;"
    local title
    title="$(sql "$db" "SELECT title FROM issues WHERE id = $id;")"
    info "Closed #$id: $title"
}

cmd_reopen() {
    [[ $# -lt 1 ]] && die "usage: op-tasks reopen <id-or-title>"
    local db
    db="$(ensure_db)"
    local id
    id="$(resolve_id "$db" "$1" "x")"
    sql "$db" "UPDATE issues SET status = ' ', closed = NULL WHERE id = $id;"
    local title
    title="$(sql "$db" "SELECT title FROM issues WHERE id = $id;")"
    info "Reopened #$id: $title"
}

cmd_status() {
    [[ $# -lt 2 ]] && die "usage: op-tasks status <id-or-title> <status>"
    local db
    db="$(ensure_db)"
    local id
    id="$(resolve_id "$db" "$1")"
    local new_status
    new_status="$(status_char "$2")"
    local closed_val="NULL"
    [[ "$new_status" == "x" || "$new_status" == "-" ]] && closed_val="datetime('now')"
    sql "$db" "UPDATE issues SET status = '$new_status', closed = $closed_val WHERE id = $id;"
    local title label_text
    title="$(sql "$db" "SELECT title FROM issues WHERE id = $id;")"
    label_text="$(status_label "$new_status")"
    info "#$id → $label_text: $title"
}

cmd_edit() {
    [[ $# -lt 1 ]] && die "usage: op-tasks edit <id> [-t title] [-l label]"
    local id="$1"; shift
    local title="" label=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--title) title="$2"; shift 2 ;;
            -l|--label) label="$2"; shift 2 ;;
            -*) die "unknown flag: $1" ;;
            *) die "unexpected argument: $1" ;;
        esac
    done

    local db
    db="$(ensure_db)"

    [[ -n "$title" ]] && sql "$db" "UPDATE issues SET title = '$(sql_escape "$title")' WHERE id = $id;"
    [[ -n "$label" ]] && sql "$db" "UPDATE issues SET label = '$(sql_escape "$label")' WHERE id = $id;"

    sql_display "$db" "SELECT id, label, title FROM issues WHERE id = $id;"
}

cmd_ready() {
    local db
    db="$(ensure_db)"
    local result
    result="$(sql_display "$db" "SELECT id, label, title FROM issues WHERE status = ' ' ORDER BY id LIMIT 1;")"
    if [[ -z "$result" ]]; then
        info "No open issues."
    else
        echo "$result"
    fi
}

cmd_block() {
    [[ $# -lt 2 ]] && die "usage: op-tasks block <blocker-id> <blocked-id>"
    local db
    db="$(ensure_db)"
    local blocker blocked
    blocker="$(resolve_id "$db" "$1")"
    blocked="$(resolve_id "$db" "$2")"
    [[ "$blocker" == "$blocked" ]] && die "an issue cannot block itself"
    sql "$db" "INSERT OR IGNORE INTO deps (blocker, blocked) VALUES ($blocker, $blocked);"
    local t1 t2
    t1="$(sql "$db" "SELECT title FROM issues WHERE id = $blocker;")"
    t2="$(sql "$db" "SELECT title FROM issues WHERE id = $blocked;")"
    info "#$blocker ($t1) blocks #$blocked ($t2)"
}

cmd_unblock() {
    [[ $# -lt 2 ]] && die "usage: op-tasks unblock <blocker-id> <blocked-id>"
    local db
    db="$(ensure_db)"
    local blocker blocked
    blocker="$(resolve_id "$db" "$1")"
    blocked="$(resolve_id "$db" "$2")"
    sql "$db" "DELETE FROM deps WHERE blocker = $blocker AND blocked = $blocked;"
    info "Removed dep: #$blocker no longer blocks #$blocked"
}

cmd_migrate() {
    local root
    root="$(find_git_root)"
    local beads_db="$root/.beads/beads.db"
    [[ -f "$beads_db" ]] || die "no .beads/beads.db found at $root"

    local db
    db="$(ensure_db)"

    local count
    count="$(sql "$db" "SELECT COUNT(*) FROM issues;")"
    [[ "$count" -gt 0 ]] && die "DB already has $count issues — migrate only works on empty DB"

    # Import from beads, mapping statuses: open→' ', closed→'x'
    sqlite3 -batch "$db" >/dev/null 2>&1 <<EOSQL
ATTACH '$beads_db' AS beads;
INSERT INTO issues (title, label, status, created, beads_id)
SELECT
    i.title,
    COALESCE(l.label, 'bug'),
    CASE i.status
        WHEN 'open' THEN ' '
        WHEN 'closed' THEN 'x'
        ELSE ' '
    END,
    i.created_at,
    i.id
FROM beads.issues i
LEFT JOIN beads.labels l ON i.id = l.issue_id
WHERE i.issue_type = 'task'
ORDER BY i.created_at;
DETACH beads;
EOSQL

    local imported
    imported="$(sql "$db" "SELECT COUNT(*) FROM issues;")"
    info "Migrated $imported issues from beads."

    # Show summary by label
    sql_display "$db" "SELECT label, COUNT(*) AS count FROM issues GROUP BY label ORDER BY count DESC;"
}

cmd_help() {
    cat <<'EOF'
op-tasks — lightweight SQLite issue tracker

Commands:
  add "title" [-l label]           Create issue (default label: bug)
  list [--label X] [--all]         List active issues (--all includes done/cancelled)
  show <id-or-title>               Show issue details + deps
  close <id-or-title>              Mark issue done
  reopen <id-or-title>             Reopen done issue
  status <id-or-title> <status>    Set status
  edit <id> [-t "title"] [-l X]    Edit title or label
  ready                            Next open issue (lowest ID)
  block <blocker> <blocked>        Add dependency (blocker blocks blocked)
  unblock <blocker> <blocked>      Remove dependency
  migrate                          One-time import from .beads/beads.db
  init                             Explicitly init .op-tasks/ (also auto-inits)

Statuses: ' '=open  /=in-progress  x=done  -=cancelled  !=blocked  ?=unsure
  Aliases: open, in-progress, done, closed, cancelled, blocked, unsure
Labels: any string (default: bug)
DB location: <git-root>/.op-tasks/issues.db
EOF
}

# ── Dispatch ─────────────────────────────────────────────────────────────────

[[ $# -lt 1 ]] && { cmd_help; exit 0; }

case "$1" in
    add)     shift; cmd_add "$@" ;;
    list|ls) shift; cmd_list "$@" ;;
    show)    shift; cmd_show "$@" ;;
    close)   shift; cmd_close "$@" ;;
    reopen)  shift; cmd_reopen "$@" ;;
    status)  shift; cmd_status "$@" ;;
    edit)    shift; cmd_edit "$@" ;;
    ready)   shift; cmd_ready "$@" ;;
    block)   shift; cmd_block "$@" ;;
    unblock) shift; cmd_unblock "$@" ;;
    migrate) shift; cmd_migrate "$@" ;;
    init)    shift; cmd_init "$@" ;;
    help|-h|--help) cmd_help ;;
    *) die "unknown command: $1 (try 'op-tasks help')" ;;
esac
