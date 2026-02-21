CREATE TABLE IF NOT EXISTS issues (
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

CREATE TABLE IF NOT EXISTS dependencies (
    blocker  INTEGER NOT NULL REFERENCES issues(id),
    blocked  INTEGER NOT NULL REFERENCES issues(id),
    PRIMARY KEY (blocker, blocked),
    CHECK(blocker != blocked)
);
