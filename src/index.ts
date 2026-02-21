import * as cmd from "./commands.ts";
import { getGitRoot, openDb } from "./db.ts";

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

if (!command || command === "help" || command === "-h" || command === "--help") {
	cmd.help(null as never, []);
	process.exit(0);
}

try {
	const db = openDb(process.cwd());

	switch (command) {
		case "init":
			cmd.init(db, commandArgs);
			break;
		case "add":
			cmd.add(db, commandArgs);
			break;
		case "list":
		case "ls":
			cmd.list(db, commandArgs);
			break;
		case "show":
			cmd.show(db, commandArgs);
			break;
		case "close":
			cmd.close(db, commandArgs);
			break;
		case "reopen":
			cmd.reopen(db, commandArgs);
			break;
		case "status":
			cmd.status(db, commandArgs);
			break;
		case "edit":
			cmd.edit(db, commandArgs);
			break;
		case "ready":
			cmd.ready(db, commandArgs);
			break;
		case "block":
			cmd.block(db, commandArgs);
			break;
		case "unblock":
			cmd.unblock(db, commandArgs);
			break;
		case "migrate":
			cmd.migrate(db, commandArgs, getGitRoot(process.cwd()));
			break;
		default:
			console.error(`error: unknown command: ${command} (try 'op-tasks help')`);
			process.exit(1);
	}

	db.close();
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`error: ${msg}`);
	process.exit(1);
}
