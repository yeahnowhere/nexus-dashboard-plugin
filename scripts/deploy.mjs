import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, ".deploy-path.local");

let target;
try {
	target = readFileSync(configPath, "utf8").trim();
} catch {
	console.error(`[deploy] Missing ${configPath}`);
	console.error("[deploy] Create it with the absolute path to the plugin folder, e.g.:");
	console.error("  D:\\Documents\\Personal\\Obsidian\\Obseq\\.obsidian\\plugins\\nexus-dashboard");
	process.exit(1);
}

if (!target) {
	console.error("[deploy] .deploy-path.local is empty");
	process.exit(1);
}

const files = ["main.js", "manifest.json", "styles.css"];
mkdirSync(target, { recursive: true });
for (const file of files) {
	const src = resolve(root, file);
	if (!existsSync(src)) {
		console.error(`[deploy] Missing ${src} — run "npm run build" first`);
		process.exit(1);
	}
	cpSync(src, resolve(target, file));
}
console.log(`[deploy] Copied ${files.join(", ")} → ${target}`);
console.log("[deploy] Reload Obsidian (disable/enable the plugin) to pick up changes.");
