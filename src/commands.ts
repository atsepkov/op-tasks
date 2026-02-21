import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { statusToChar, statusToWord, toJson } from "./json.ts";
import type { Issue } from "./types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a flag value from args. Returns the value and removes flag+value from array. */
function getFlag(args: string[], ...flags: string[]): string | undefined {
	for (const flag of flags) {
		const idx = args.indexOf(flag);
		if (idx !== -1 && idx + 1 < args.length) {
			const val = args[idx + 1];
			if (val === undefined) return undefined;
			args.splice(idx, 2);
			return val;
		}
	}
	return undefined;
}

/** Check if a boolean flag is present and remove it. */
function hasFlag(args: string[], ...flags: string[]): boolean {
	for (const flag of flags) {
		const idx = args.indexOf(flag);
		if (idx !== -1) {
			args.splice(idx, 1);
			return true;
		}
	}
	return false;
}

/**
 * Resolve an argument to an issue ID.
 * If numeric, use directly. Otherwise, case-insensitive substring match on title.
 */
function resolveId(db: Database, arg: string, statusFilter?: string): number {
	if (/^\d+$/.test(arg)) return Number.parseInt(arg, 10);

	let rows: { id: number; title: string }[];
	if (statusFilter) {
		rows = db
			.query<{ id: number; title: string }, [string, string]>(
				"SELECT id, title FROM issues WHERE title LIKE '%' || ? || '%' COLLATE NOCASE AND status = ?",
			)
			.all(arg, statusFilter);
	} else {
		rows = db
			.query<{ id: number; title: string }, [string]>(
				"SELECT id, title FROM issues WHERE title LIKE '%' || ? || '%' COLLATE NOCASE",
			)
			.all(arg);
	}

	if (rows.length === 0) {
		throw new Error(`no issue matching '${arg}'`);
	}
	if (rows.length > 1) {
		const matches = rows.map((r) => `  #${r.id}  ${r.title}`).join("\n");
		throw new Error(`multiple matches for "${arg}":\n${matches}`);
	}
	const first = rows[0];
	if (!first) throw new Error(`no issue matching '${arg}'`);
	return first.id;
}

/** Format a human-readable issue line. */
function formatIssueLine(issue: Issue): string {
	const status = statusToWord(issue.status);
	const prio = issue.priority > 0 ? ` p${issue.priority}` : "";
	return `#${issue.id} [${status}] ${issue.title} [${issue.label}]${prio}`;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function init(db: Database, _args: string[]): void {
	// DB already opened/initialized by caller
	console.log("Initialized op-tasks database");
}

export function add(db: Database, args: string[]): void {
	const json = hasFlag(args, "--json");
	const label = getFlag(args, "-l", "--label") ?? "task";
	const description = getFlag(args, "--description", "-d") ?? null;
	const priorityStr = getFlag(args, "--priority", "-p");
	const priority = priorityStr ? Number.parseInt(priorityStr, 10) : 0;

	// Remaining positional arg is the title
	const title = args.find((a) => !a.startsWith("-"));
	if (!title) {
		throw new Error('usage: op-tasks add "title" [-l label] [--description "text"] [--priority N]');
	}

	const row = db
		.query<Issue, [string, string, number, string | null]>(
			"INSERT INTO issues (title, label, priority, description) VALUES (?, ?, ?, ?) RETURNING *",
		)
		.get(title, label, priority, description);

	if (!row) throw new Error("failed to insert issue");

	if (json) {
		console.log(JSON.stringify(toJson(row, db)));
	} else {
		console.log(`#${row.id} ${row.title} [${row.label}]`);
	}
}

export function list(db: Database, args: string[]): void {
	const json = hasFlag(args, "--json");
	const showAll = hasFlag(args, "--all", "-a");
	const label = getFlag(args, "--label", "-l");
	const statusFilter = getFlag(args, "--status", "-s");

	let sql = "SELECT * FROM issues WHERE 1=1";
	const params: (string | number)[] = [];

	if (!showAll) {
		sql += " AND status NOT IN ('x', '-')";
	}
	if (label) {
		sql += " AND label = ?";
		params.push(label);
	}
	if (statusFilter) {
		const char = statusToChar(statusFilter);
		sql += " AND status = ?";
		params.push(char);
	}

	sql += " ORDER BY id";

	const stmt = db.query<Issue, (string | number)[]>(sql);
	const rows = stmt.all(...params);

	if (json) {
		console.log(JSON.stringify(rows.map((r) => toJson(r, db))));
	} else if (rows.length === 0) {
		console.log("No issues found.");
	} else {
		// Table header
		console.log(
			`${"id".padStart(4)}  ${"status".padEnd(12)}  ${"label".padEnd(10)}  ${"pri".padStart(3)}  title`,
		);
		console.log("-".repeat(70));
		for (const row of rows) {
			const status = statusToWord(row.status);
			console.log(
				`${String(row.id).padStart(4)}  ${status.padEnd(12)}  ${row.label.padEnd(10)}  ${String(row.priority).padStart(3)}  ${row.title}`,
			);
		}
	}
}

export function show(db: Database, args: string[]): void {
	const json = hasFlag(args, "--json");
	const idArg = args[0];
	if (!idArg) throw new Error("usage: op-tasks show <id-or-title>");

	const id = resolveId(db, idArg);
	const row = db.query<Issue, [number]>("SELECT * FROM issues WHERE id = ?").get(id);
	if (!row) throw new Error(`issue #${id} not found`);

	if (json) {
		console.log(JSON.stringify(toJson(row, db)));
	} else {
		console.log(`#${row.id}: ${row.title}`);
		console.log(`  Status:   ${statusToWord(row.status)}`);
		console.log(`  Label:    ${row.label}`);
		console.log(`  Priority: ${row.priority}`);
		console.log(`  Created:  ${row.created}`);
		if (row.closed) console.log(`  Closed:   ${row.closed}`);
		if (row.description) console.log(`  Description: ${row.description}`);
		if (row.resolution) console.log(`  Resolution:  ${row.resolution}`);

		// Dependencies
		const blockers = db
			.query<{ blocker: number; title: string }, [number]>(
				"SELECT d.blocker, i.title FROM dependencies d JOIN issues i ON i.id = d.blocker WHERE d.blocked = ?",
			)
			.all(id);
		const blocked = db
			.query<{ blocked: number; title: string }, [number]>(
				"SELECT d.blocked, i.title FROM dependencies d JOIN issues i ON i.id = d.blocked WHERE d.blocker = ?",
			)
			.all(id);

		if (blockers.length > 0) {
			console.log("  Blocked by:");
			for (const b of blockers) {
				console.log(`    #${b.blocker} ${b.title}`);
			}
		}
		if (blocked.length > 0) {
			console.log("  Blocks:");
			for (const b of blocked) {
				console.log(`    #${b.blocked} ${b.title}`);
			}
		}
	}
}

export function close(db: Database, args: string[]): void {
	const resolution = getFlag(args, "--resolution", "-r") ?? null;
	const idArg = args[0];
	if (!idArg) throw new Error("usage: op-tasks close <id-or-title> [--resolution text]");

	const id = resolveId(db, idArg);
	db.query<null, [string | null, number]>(
		"UPDATE issues SET status = 'x', closed = datetime('now'), resolution = ? WHERE id = ?",
	).run(resolution, id);

	const title = db
		.query<{ title: string }, [number]>("SELECT title FROM issues WHERE id = ?")
		.get(id);
	console.log(`Closed #${id}: ${title?.title}`);
}

export function reopen(db: Database, args: string[]): void {
	const idArg = args[0];
	if (!idArg) throw new Error("usage: op-tasks reopen <id-or-title>");

	const id = resolveId(db, idArg, "x");
	db.query<null, [number]>(
		"UPDATE issues SET status = ' ', closed = NULL, resolution = NULL WHERE id = ?",
	).run(id);

	const title = db
		.query<{ title: string }, [number]>("SELECT title FROM issues WHERE id = ?")
		.get(id);
	console.log(`Reopened #${id}: ${title?.title}`);
}

export function status(db: Database, args: string[]): void {
	const idArg = args[0];
	const statusArg = args[1];
	if (!idArg || !statusArg) throw new Error("usage: op-tasks status <id-or-title> <status>");
	const id = resolveId(db, idArg);
	const newStatus = statusToChar(statusArg);

	const isTerminal = newStatus === "x" || newStatus === "-";
	if (isTerminal) {
		db.query<null, [string, number]>(
			"UPDATE issues SET status = ?, closed = datetime('now') WHERE id = ?",
		).run(newStatus, id);
	} else {
		db.query<null, [string, number]>(
			"UPDATE issues SET status = ?, closed = NULL WHERE id = ?",
		).run(newStatus, id);
	}

	const title = db
		.query<{ title: string }, [number]>("SELECT title FROM issues WHERE id = ?")
		.get(id);
	console.log(`#${id} → ${statusToWord(newStatus)}: ${title?.title}`);
}

export function edit(db: Database, args: string[]): void {
	const idArg = args[0];
	if (!idArg)
		throw new Error(
			"usage: op-tasks edit <id> [-t title] [-l label] [-d description] [-p priority]",
		);

	// Remove ID from args before parsing flags
	args.shift();

	const title = getFlag(args, "-t", "--title");
	const label = getFlag(args, "-l", "--label");
	const description = getFlag(args, "-d", "--description");
	const priorityStr = getFlag(args, "-p", "--priority");

	const id = resolveId(db, idArg);

	if (title) {
		db.query<null, [string, number]>("UPDATE issues SET title = ? WHERE id = ?").run(title, id);
	}
	if (label) {
		db.query<null, [string, number]>("UPDATE issues SET label = ? WHERE id = ?").run(label, id);
	}
	if (description !== undefined) {
		db.query<null, [string, number]>("UPDATE issues SET description = ? WHERE id = ?").run(
			description,
			id,
		);
	}
	if (priorityStr) {
		const priority = Number.parseInt(priorityStr, 10);
		db.query<null, [number, number]>("UPDATE issues SET priority = ? WHERE id = ?").run(
			priority,
			id,
		);
	}

	const row = db.query<Issue, [number]>("SELECT * FROM issues WHERE id = ?").get(id);
	if (row) console.log(formatIssueLine(row));
}

export function ready(db: Database, args: string[]): void {
	const json = hasFlag(args, "--json");

	// Open issues with no unresolved blockers, ordered by priority desc then id asc
	const rows = db
		.query<Issue, []>(
			`SELECT i.* FROM issues i
			WHERE i.status = ' '
			  AND i.id NOT IN (
			    SELECT d.blocked FROM dependencies d
			    JOIN issues blocker ON blocker.id = d.blocker
			    WHERE blocker.status NOT IN ('x', '-')
			  )
			ORDER BY i.priority DESC, i.id ASC`,
		)
		.all();

	if (json) {
		console.log(JSON.stringify(rows.map((r) => toJson(r, db))));
	} else if (rows.length === 0) {
		console.log("No open issues.");
	} else {
		for (const row of rows) {
			console.log(formatIssueLine(row));
		}
	}
}

export function block(db: Database, args: string[]): void {
	const a0 = args[0];
	const a1 = args[1];
	if (!a0 || !a1) throw new Error("usage: op-tasks block <blocker-id> <blocked-id>");

	const blockerId = resolveId(db, a0);
	const blockedId = resolveId(db, a1);

	if (blockerId === blockedId) throw new Error("an issue cannot block itself");

	db.query<null, [number, number]>(
		"INSERT OR IGNORE INTO dependencies (blocker, blocked) VALUES (?, ?)",
	).run(blockerId, blockedId);

	const t1 = db
		.query<{ title: string }, [number]>("SELECT title FROM issues WHERE id = ?")
		.get(blockerId);
	const t2 = db
		.query<{ title: string }, [number]>("SELECT title FROM issues WHERE id = ?")
		.get(blockedId);
	console.log(`#${blockerId} (${t1?.title}) blocks #${blockedId} (${t2?.title})`);
}

export function unblock(db: Database, args: string[]): void {
	const a0 = args[0];
	const a1 = args[1];
	if (!a0 || !a1) throw new Error("usage: op-tasks unblock <blocker-id> <blocked-id>");

	const blockerId = resolveId(db, a0);
	const blockedId = resolveId(db, a1);

	db.query<null, [number, number]>(
		"DELETE FROM dependencies WHERE blocker = ? AND blocked = ?",
	).run(blockerId, blockedId);

	console.log(`Removed dep: #${blockerId} no longer blocks #${blockedId}`);
}

export function migrate(db: Database, _args: string[], gitRoot: string): void {
	const beadsDb = `${gitRoot}/.beads/beads.db`;
	if (!existsSync(beadsDb)) {
		throw new Error(`no .beads/beads.db found at ${gitRoot}`);
	}

	const count = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM issues").get();
	if (count && count.count > 0) {
		throw new Error(`DB already has ${count.count} issues — migrate only works on empty DB`);
	}

	db.exec(`
		ATTACH '${beadsDb}' AS beads;
		INSERT INTO issues (title, label, status, created)
		SELECT
			i.title,
			COALESCE(l.label, 'task'),
			CASE i.status
				WHEN 'open' THEN ' '
				WHEN 'closed' THEN 'x'
				ELSE ' '
			END,
			i.created_at
		FROM beads.issues i
		LEFT JOIN beads.labels l ON i.id = l.issue_id
		WHERE i.issue_type = 'task'
		ORDER BY i.created_at;
		DETACH beads;
	`);

	const imported = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM issues").get();
	console.log(`Migrated ${imported?.count ?? 0} issues from beads.`);

	// Summary by label
	const labels = db
		.query<{ label: string; count: number }, []>(
			"SELECT label, COUNT(*) as count FROM issues GROUP BY label ORDER BY count DESC",
		)
		.all();
	for (const l of labels) {
		console.log(`  ${l.label}: ${l.count}`);
	}
}

export function help(_db: Database, _args: string[]): void {
	console.log(`op-tasks — lightweight SQLite issue tracker

Commands:
  add "title" [-l label] [-d desc] [-p N]  Create issue (default label: task)
  list [--label X] [--all] [--status S]    List issues (--all includes done/cancelled)
  show <id-or-title> [--json]              Show issue details + deps
  close <id-or-title> [--resolution text]  Mark issue done
  reopen <id-or-title>                     Reopen done issue
  status <id-or-title> <status>            Set status
  edit <id> [-t title] [-l label] ...      Edit fields
  ready [--json]                           Open issues with no unresolved blockers
  block <blocker> <blocked>                Add dependency
  unblock <blocker> <blocked>              Remove dependency
  migrate                                  One-time import from .beads/beads.db
  init                                     Explicitly init .op-tasks/
  help                                     Show this help

Statuses: open  in_progress  done  cancelled  blocked  unsure
  Chars:  ' '   /            x     -          !        ?
Labels: any string (default: task)
DB: <git-root>/.op-tasks/issues.db

All data commands support --json for machine-readable output.`);
}
