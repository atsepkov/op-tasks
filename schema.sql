CREATE TABLE IF NOT EXISTS issues (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    label    TEXT NOT NULL DEFAULT 'bug',
    status   TEXT NOT NULL DEFAULT ' '
                CHECK(status IN (' ', '/', 'x', '-', '!', '?')),
    created  TEXT NOT NULL DEFAULT (datetime('now')),
    closed   TEXT,
    beads_id TEXT
);

CREATE TABLE IF NOT EXISTS deps (
    blocker  INTEGER NOT NULL REFERENCES issues(id),
    blocked  INTEGER NOT NULL REFERENCES issues(id),
    PRIMARY KEY (blocker, blocked),
    CHECK(blocker != blocked)
);
