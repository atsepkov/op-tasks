CREATE TABLE IF NOT EXISTS issues (
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
