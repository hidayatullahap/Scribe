// Runs automatically after `npm install github:hidayatullahap/Scribe`.
// Copies Scribe's Luau sources and index.d.ts into the game's roblox-ts
// sources, so the game can `import Scribe from "shared/Scribe"` with no
// further manual steps.
//
// Destination defaults to `src/shared/Scribe` inside the game folder.
// Override it with the SCRIBE_DEST environment variable:
//   SCRIBE_DEST=src/shared/Data npm install github:hidayatullahap/Scribe
//
// Reinstalling replaces the folder, so updating Scribe is just installing again.

const fs = require("fs");
const path = require("path");

const destFromEnv = process.env.SCRIBE_DEST;

function main() {
	const ownDir = path.resolve(__dirname, "..");
	const consumerDir = process.env.INIT_CWD || process.cwd();

	// Skip when working inside the Scribe repo itself (development checkout).
	if (path.resolve(consumerDir) === ownDir) {
		console.log("Scribe: postinstall skipped (running inside the Scribe repo).");
		return;
	}

	const destDir = destFromEnv
		? path.resolve(consumerDir, destFromEnv)
		: path.join(consumerDir, "src", "shared", "Scribe");

	fs.rmSync(destDir, { recursive: true, force: true });
	fs.cpSync(path.join(ownDir, "src"), destDir, { recursive: true });
	fs.copyFileSync(
		path.join(ownDir, "index.d.ts"),
		path.join(destDir, "index.d.ts"),
	);

	console.log(`Scribe: copied Luau sources and index.d.ts to ${destDir}`);
	console.log('Scribe: use it with `import Scribe from "shared/Scribe";`');
}

main();
