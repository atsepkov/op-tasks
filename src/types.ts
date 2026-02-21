/** Database row shape for an issue. */
export interface Issue {
	id: number;
	title: string;
	label: string;
	/** Single-char status: ' ', '/', 'x', '-', '!', '?' */
	status: string;
	priority: number;
	description: string | null;
	resolution: string | null;
	created: string;
	closed: string | null;
}

/** JSON output shape for an issue (status as word, includes dependencies). */
export interface IssueJson {
	id: number;
	title: string;
	label: string;
	/** Word form: "open", "in_progress", "done", "cancelled", "blocked", "unsure" */
	status: string;
	priority: number;
	description: string | null;
	resolution: string | null;
	created: string;
	closed: string | null;
	blocks: number[];
	blockedBy: number[];
}

/** Map single-char status to JSON word. */
export const STATUS_CHAR_TO_WORD: Record<string, string> = {
	" ": "open",
	"/": "in_progress",
	x: "done",
	"-": "cancelled",
	"!": "blocked",
	"?": "unsure",
};

/** Map JSON word (and aliases) to single-char status. */
export const STATUS_WORD_TO_CHAR: Record<string, string> = {
	open: " ",
	in_progress: "/",
	"in-progress": "/",
	done: "x",
	closed: "x",
	cancelled: "-",
	blocked: "!",
	unsure: "?",
	// Single-char pass-through
	" ": " ",
	"/": "/",
	x: "x",
	"-": "-",
	"!": "!",
	"?": "?",
};
