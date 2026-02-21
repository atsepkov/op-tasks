import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import * as cmd from "./commands.ts";
import { statusToChar, statusToWord, toJson } from "./json.ts";
import type { Issue } from "./types.ts";

// We use in-memory DBs with schema applied directly (no git root needed).
// Commands that don't need git root work fine. For migrate, we skip it.

function createTestDb(): Database {
	const db = new Database(":memory:");
	db.exec("PRAGMA journal_mode=WAL");
	db.exec("PRAGMA foreign_keys=ON");
	db.exec(`
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
	`);
	return db;
}

/** Capture console.log output during a function call. */
function captureOutput(fn: () => void): string {
	const lines: string[] = [];
	const origLog = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	try {
		fn();
	} finally {
		console.log = origLog;
	}
	return lines.join("\n");
}

// ── Status mapping tests ─────────────────────────────────────────────────

describe("status mapping", () => {
	test("statusToWord maps all chars", () => {
		expect(statusToWord(" ")).toBe("open");
		expect(statusToWord("/")).toBe("in_progress");
		expect(statusToWord("x")).toBe("done");
		expect(statusToWord("-")).toBe("cancelled");
		expect(statusToWord("!")).toBe("blocked");
		expect(statusToWord("?")).toBe("unsure");
	});

	test("statusToChar maps words to chars", () => {
		expect(statusToChar("open")).toBe(" ");
		expect(statusToChar("in_progress")).toBe("/");
		expect(statusToChar("in-progress")).toBe("/");
		expect(statusToChar("done")).toBe("x");
		expect(statusToChar("closed")).toBe("x");
		expect(statusToChar("cancelled")).toBe("-");
		expect(statusToChar("blocked")).toBe("!");
		expect(statusToChar("unsure")).toBe("?");
	});

	test("statusToChar passes through single chars", () => {
		expect(statusToChar(" ")).toBe(" ");
		expect(statusToChar("/")).toBe("/");
		expect(statusToChar("x")).toBe("x");
	});

	test("statusToChar throws on invalid input", () => {
		expect(() => statusToChar("invalid")).toThrow("invalid status");
	});
});

// ── add command ──────────────────────────────────────────────────────────

describe("add", () => {
	test("creates issue with title", () => {
		const db = createTestDb();
		const output = captureOutput(() => cmd.add(db, ["My first task"]));
		expect(output).toContain("#1");
		expect(output).toContain("My first task");
		expect(output).toContain("[task]");

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row).toBeTruthy();
		expect(row?.title).toBe("My first task");
		expect(row?.label).toBe("task");
		expect(row?.status).toBe(" ");
		expect(row?.priority).toBe(0);
	});

	test("creates issue with label", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Bug report", "-l", "bug"]));
		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.label).toBe("bug");
	});

	test("creates issue with description and priority", () => {
		const db = createTestDb();
		captureOutput(() =>
			cmd.add(db, ["Important task", "--description", "Do the thing", "--priority", "5"]),
		);
		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.description).toBe("Do the thing");
		expect(row?.priority).toBe(5);
	});

	test("--json outputs valid JSON", () => {
		const db = createTestDb();
		const output = captureOutput(() => cmd.add(db, ["--json", "JSON task"]));
		const parsed = JSON.parse(output);
		expect(parsed.id).toBe(1);
		expect(parsed.title).toBe("JSON task");
		expect(parsed.status).toBe("open");
		expect(parsed.blocks).toEqual([]);
		expect(parsed.blockedBy).toEqual([]);
	});

	test("throws without title", () => {
		const db = createTestDb();
		expect(() => cmd.add(db, [])).toThrow("usage");
	});
});

// ── show command ─────────────────────────────────────────────────────────

describe("show", () => {
	test("shows issue details", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Test issue"]));
		const output = captureOutput(() => cmd.show(db, ["1"]));
		expect(output).toContain("#1");
		expect(output).toContain("Test issue");
		expect(output).toContain("open");
	});

	test("shows issue by title substring", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Unique title here"]));
		const output = captureOutput(() => cmd.show(db, ["Unique"]));
		expect(output).toContain("Unique title here");
	});

	test("--json includes dependencies", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Blocker"]));
		captureOutput(() => cmd.add(db, ["Blocked"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));

		const output = captureOutput(() => cmd.show(db, ["--json", "1"]));
		const parsed = JSON.parse(output);
		expect(parsed.blocks).toEqual([2]);
		expect(parsed.blockedBy).toEqual([]);

		const output2 = captureOutput(() => cmd.show(db, ["--json", "2"]));
		const parsed2 = JSON.parse(output2);
		expect(parsed2.blocks).toEqual([]);
		expect(parsed2.blockedBy).toEqual([1]);
	});

	test("throws on missing id", () => {
		const db = createTestDb();
		expect(() => cmd.show(db, [])).toThrow("usage");
	});
});

// ── list command ─────────────────────────────────────────────────────────

describe("list", () => {
	test("lists active issues", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Task A"]));
		captureOutput(() => cmd.add(db, ["Task B"]));
		captureOutput(() => cmd.add(db, ["Task C"]));
		captureOutput(() => cmd.close(db, ["3"]));

		const output = captureOutput(() => cmd.list(db, []));
		expect(output).toContain("Task A");
		expect(output).toContain("Task B");
		expect(output).not.toContain("Task C"); // closed, excluded by default
	});

	test("--all includes closed", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Open"]));
		captureOutput(() => cmd.add(db, ["Closed"]));
		captureOutput(() => cmd.close(db, ["2"]));

		const output = captureOutput(() => cmd.list(db, ["--all"]));
		expect(output).toContain("Open");
		expect(output).toContain("Closed");
	});

	test("--label filters by label", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Bug one", "-l", "bug"]));
		captureOutput(() => cmd.add(db, ["Feature one", "-l", "feature"]));

		const output = captureOutput(() => cmd.list(db, ["--label", "bug"]));
		expect(output).toContain("Bug one");
		expect(output).not.toContain("Feature one");
	});

	test("--status filters by status", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Open task"]));
		captureOutput(() => cmd.add(db, ["WIP task"]));
		captureOutput(() => cmd.status(db, ["2", "in_progress"]));

		const output = captureOutput(() => cmd.list(db, ["--status", "in_progress"]));
		expect(output).toContain("WIP task");
		expect(output).not.toContain("Open task");
	});

	test("--json outputs array", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Task A"]));
		captureOutput(() => cmd.add(db, ["Task B"]));

		const output = captureOutput(() => cmd.list(db, ["--json"]));
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(2);
		expect(parsed[0].status).toBe("open");
	});
});

// ── close command ────────────────────────────────────────────────────────

describe("close", () => {
	test("closes issue", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["To close"]));
		const output = captureOutput(() => cmd.close(db, ["1"]));
		expect(output).toContain("Closed #1");

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.status).toBe("x");
		expect(row?.closed).toBeTruthy();
	});

	test("stores resolution", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["To close"]));
		captureOutput(() => cmd.close(db, ["1", "--resolution", "Fixed the bug"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.resolution).toBe("Fixed the bug");
	});
});

// ── reopen command ───────────────────────────────────────────────────────

describe("reopen", () => {
	test("reopens closed issue", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["To reopen"]));
		captureOutput(() => cmd.close(db, ["1"]));
		const output = captureOutput(() => cmd.reopen(db, ["1"]));
		expect(output).toContain("Reopened #1");

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.status).toBe(" ");
		expect(row?.closed).toBeNull();
		expect(row?.resolution).toBeNull();
	});
});

// ── status command ───────────────────────────────────────────────────────

describe("status", () => {
	test("sets status with word", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["WIP"]));
		captureOutput(() => cmd.status(db, ["1", "in_progress"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.status).toBe("/");
	});

	test("sets status with char", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Blocked"]));
		captureOutput(() => cmd.status(db, ["1", "!"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.status).toBe("!");
	});

	test("sets closed timestamp for terminal states", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Cancel me"]));
		captureOutput(() => cmd.status(db, ["1", "cancelled"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.status).toBe("-");
		expect(row?.closed).toBeTruthy();
	});
});

// ── edit command ─────────────────────────────────────────────────────────

describe("edit", () => {
	test("edits title", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Old title"]));
		captureOutput(() => cmd.edit(db, ["1", "-t", "New title"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.title).toBe("New title");
	});

	test("edits label", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Task"]));
		captureOutput(() => cmd.edit(db, ["1", "-l", "bug"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.label).toBe("bug");
	});

	test("edits priority", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Task"]));
		captureOutput(() => cmd.edit(db, ["1", "-p", "10"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row?.priority).toBe(10);
	});
});

// ── ready command (fixed: checks dependencies) ──────────────────────────

describe("ready", () => {
	test("returns open issues", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Ready task"]));
		const output = captureOutput(() => cmd.ready(db, []));
		expect(output).toContain("Ready task");
	});

	test("excludes issues with unresolved blockers", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Blocker"]));
		captureOutput(() => cmd.add(db, ["Blocked task"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));

		const output = captureOutput(() => cmd.ready(db, []));
		expect(output).toContain("Blocker");
		expect(output).not.toContain("Blocked task");
	});

	test("includes issue when blocker is resolved", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Blocker"]));
		captureOutput(() => cmd.add(db, ["Was blocked"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));
		captureOutput(() => cmd.close(db, ["1"]));

		const output = captureOutput(() => cmd.ready(db, []));
		expect(output).toContain("Was blocked");
	});

	test("orders by priority desc then id asc", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Low prio", "--priority", "1"]));
		captureOutput(() => cmd.add(db, ["High prio", "--priority", "5"]));
		captureOutput(() => cmd.add(db, ["Med prio", "--priority", "3"]));

		const output = captureOutput(() => cmd.ready(db, ["--json"]));
		const parsed = JSON.parse(output);
		expect(parsed[0].title).toBe("High prio");
		expect(parsed[1].title).toBe("Med prio");
		expect(parsed[2].title).toBe("Low prio");
	});

	test("--json outputs array", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Task"]));

		const output = captureOutput(() => cmd.ready(db, ["--json"]));
		const parsed = JSON.parse(output);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].status).toBe("open");
	});

	test("shows nothing when all issues closed", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Done"]));
		captureOutput(() => cmd.close(db, ["1"]));

		const output = captureOutput(() => cmd.ready(db, []));
		expect(output).toContain("No open issues");
	});
});

// ── block/unblock commands ───────────────────────────────────────────────

describe("block/unblock", () => {
	test("creates dependency", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["A"]));
		captureOutput(() => cmd.add(db, ["B"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));

		const dep = db
			.query<{ blocker: number; blocked: number }, []>("SELECT * FROM dependencies")
			.get();
		expect(dep?.blocker).toBe(1);
		expect(dep?.blocked).toBe(2);
	});

	test("removes dependency", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["A"]));
		captureOutput(() => cmd.add(db, ["B"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));
		captureOutput(() => cmd.unblock(db, ["1", "2"]));

		const dep = db
			.query<{ blocker: number; blocked: number }, []>("SELECT * FROM dependencies")
			.get();
		expect(dep).toBeNull();
	});

	test("prevents self-blocking", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Self"]));
		expect(() => cmd.block(db, ["1", "1"])).toThrow("cannot block itself");
	});
});

// ── toJson ───────────────────────────────────────────────────────────────

describe("toJson", () => {
	test("converts issue to JSON shape", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Test", "--description", "A desc", "--priority", "3"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row).toBeTruthy();
		const json = toJson(row as Issue, db);

		expect(json.id).toBe(1);
		expect(json.title).toBe("Test");
		expect(json.status).toBe("open");
		expect(json.priority).toBe(3);
		expect(json.description).toBe("A desc");
		expect(json.resolution).toBeNull();
		expect(json.blocks).toEqual([]);
		expect(json.blockedBy).toEqual([]);
	});

	test("includes dependency arrays", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["A"]));
		captureOutput(() => cmd.add(db, ["B"]));
		captureOutput(() => cmd.add(db, ["C"]));
		captureOutput(() => cmd.block(db, ["1", "2"]));
		captureOutput(() => cmd.block(db, ["1", "3"]));

		const row = db.query<Issue, []>("SELECT * FROM issues WHERE id = 1").get();
		expect(row).toBeTruthy();
		const json = toJson(row as Issue, db);
		expect(json.blocks).toEqual([2, 3]);
		expect(json.blockedBy).toEqual([]);

		const row2 = db.query<Issue, []>("SELECT * FROM issues WHERE id = 2").get();
		expect(row2).toBeTruthy();
		const json2 = toJson(row2 as Issue, db);
		expect(json2.blocks).toEqual([]);
		expect(json2.blockedBy).toEqual([1]);
	});
});

// ── resolve by title substring ───────────────────────────────────────────

describe("resolve by title", () => {
	test("resolves unique substring", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Unique thing"]));
		const output = captureOutput(() => cmd.show(db, ["Unique"]));
		expect(output).toContain("Unique thing");
	});

	test("errors on ambiguous match", () => {
		const db = createTestDb();
		captureOutput(() => cmd.add(db, ["Similar task A"]));
		captureOutput(() => cmd.add(db, ["Similar task B"]));
		expect(() => cmd.show(db, ["Similar"])).toThrow("multiple matches");
	});

	test("errors on no match", () => {
		const db = createTestDb();
		expect(() => cmd.show(db, ["nonexistent"])).toThrow("no issue matching");
	});
});
