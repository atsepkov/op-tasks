import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walk up from `cwd` to find the git root. */
function findGitRoot(cwd: string): string {
	let dir = resolve(cwd);
	while (dir !== "/") {
		if (existsSync(join(dir, ".git"))) return dir;
		dir = dirname(dir);
	}
	throw new Error("not inside a git repository");
}

/** Ensure .op-tasks/ is in .gitignore. */
function ensureGitignore(gitRoot: string): void {
	const gi = join(gitRoot, ".gitignore");
	if (existsSync(gi)) {
		const content = readFileSync(gi, "utf-8");
		if (!content.split("\n").some((line) => line.trim() === ".op-tasks/")) {
			writeFileSync(gi, `${content.trimEnd()}\n.op-tasks/\n`);
		}
	} else {
		writeFileSync(gi, ".op-tasks/\n");
	}
}

/** Read schema.sql from the package root. */
function loadSchema(): string {
	// schema.sql lives next to package.json, one level up from src/
	const schemaPath = join(import.meta.dir, "..", "schema.sql");
	return readFileSync(schemaPath, "utf-8");
}

/** Auto-migrate: add columns missing from old databases. */
function migrateIfNeeded(db: Database): void {
	const columns = db.query<{ name: string }, []>("PRAGMA table_info(issues)").all();
	const colNames = new Set(columns.map((c) => c.name));

	if (!colNames.has("priority")) {
		db.exec("ALTER TABLE issues ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
	}
	if (!colNames.has("description")) {
		db.exec("ALTER TABLE issues ADD COLUMN description TEXT");
	}
	if (!colNames.has("resolution")) {
		db.exec("ALTER TABLE issues ADD COLUMN resolution TEXT");
	}

	// Migrate old `deps` table name to `dependencies`
	const tables = db
		.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
		.all();
	const tableNames = new Set(tables.map((t) => t.name));
	if (tableNames.has("deps") && !tableNames.has("dependencies")) {
		db.exec("ALTER TABLE deps RENAME TO dependencies");
	}
}

/**
 * Open (or create) the op-tasks database.
 * Walks up to git root, creates .op-tasks/ if needed, applies schema, runs migrations.
 */
export function openDb(cwd: string): Database {
	const gitRoot = findGitRoot(cwd);
	const dbDir = join(gitRoot, ".op-tasks");
	const dbPath = join(dbDir, "issues.db");
	const isNew = !existsSync(dbPath);

	if (isNew) {
		mkdirSync(dbDir, { recursive: true });
		ensureGitignore(gitRoot);
	}

	const db = new Database(dbPath);
	db.exec("PRAGMA journal_mode=WAL");
	db.exec("PRAGMA busy_timeout=5000");
	db.exec("PRAGMA foreign_keys=ON");

	if (isNew) {
		db.exec(loadSchema());
	} else {
		// Ensure tables exist (idempotent CREATE IF NOT EXISTS)
		db.exec(loadSchema());
		migrateIfNeeded(db);
	}

	return db;
}

/** Return the git root for the given cwd. Exported for use in commands. */
export function getGitRoot(cwd: string): string {
	return findGitRoot(cwd);
}
