import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
	const DOT_PI = `${process.env.HOME}/.pi`;

	function sh(cmd: string): string {
		return execSync(cmd, { cwd: DOT_PI, encoding: "utf-8", timeout: 15000 }).trim();
	}

	function isSpawn(): boolean {
		try {
			const branch = sh("git -C . rev-parse --abbrev-ref HEAD 2>/dev/null");
			return branch.startsWith("spawn/");
		} catch {
			return false;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		if (isSpawn()) return;

		// Check if ~/.pi is a git repo
		try {
			sh("git rev-parse --git-dir");
		} catch {
			return; // Not a git repo, nothing to sync
		}

		// Fetch remote
		try {
			sh("git fetch origin --quiet");
		} catch {
			return; // Offline or no remote — silently skip
		}

		// Check if behind
		let behind: number;
		try {
			const count = sh("git rev-list HEAD..origin/main --count");
			behind = parseInt(count, 10);
		} catch {
			return;
		}

		if (behind === 0) return;

		const ok = await ctx.ui.confirm(
			"dot-pi updates",
			`~/.pi is ${behind} commit${behind > 1 ? "s" : ""} behind origin/main. Pull?`,
		);

		if (ok) {
			try {
				sh("git pull --ff-only origin main");
				ctx.ui.notify("~/.pi updated. Use /reload to pick up changes.", "success");
			} catch (e: any) {
				ctx.ui.notify(`Pull failed: ${e.message}`, "error");
			}
		}
	});
}
