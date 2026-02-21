import type { Database } from "bun:sqlite";
import type { Issue, IssueJson } from "./types.ts";
import { STATUS_CHAR_TO_WORD, STATUS_WORD_TO_CHAR } from "./types.ts";

/** Convert a single-char status to its word form. */
export function statusToWord(char: string): string {
	return STATUS_CHAR_TO_WORD[char] ?? char;
}

/** Convert a word (or char) to the single-char status. Throws on invalid input. */
export function statusToChar(input: string): string {
	const char = STATUS_WORD_TO_CHAR[input];
	if (char === undefined) {
		const valid = Object.keys(STATUS_CHAR_TO_WORD)
			.map((k) => `${STATUS_CHAR_TO_WORD[k]}`)
			.join(", ");
		throw new Error(`invalid status: "${input}" (valid: ${valid})`);
	}
	return char;
}

/** Get issue IDs that this issue blocks (i.e., issues waiting on this one). */
function getBlocks(db: Database, issueId: number): number[] {
	const rows = db
		.query<{ blocked: number }, [number]>("SELECT blocked FROM dependencies WHERE blocker = ?")
		.all(issueId);
	return rows.map((r) => r.blocked);
}

/** Get issue IDs that block this issue (i.e., this issue's prerequisites). */
function getBlockedBy(db: Database, issueId: number): number[] {
	const rows = db
		.query<{ blocker: number }, [number]>("SELECT blocker FROM dependencies WHERE blocked = ?")
		.all(issueId);
	return rows.map((r) => r.blocker);
}

/** Convert a DB issue row to JSON output shape. */
export function toJson(issue: Issue, db: Database): IssueJson {
	return {
		id: issue.id,
		title: issue.title,
		label: issue.label,
		status: statusToWord(issue.status),
		priority: issue.priority,
		description: issue.description,
		resolution: issue.resolution,
		created: issue.created,
		closed: issue.closed,
		blocks: getBlocks(db, issue.id),
		blockedBy: getBlockedBy(db, issue.id),
	};
}
