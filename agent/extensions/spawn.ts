/**
 * Spawn extension — create and manage git worktree + tmux session + pi instances.
 *
 * Commands:
 *   /spawn <task>   — create a new worktree + tmux session + pi for a task
 *   /spawn-list     — list worktrees, select one to merge or clean up
 *
 * /spawn creates:
 *   1. Asks which spawn mode to use:
 *      - Resume: fork session file to the spawned pi (full tree + /tree navigation),
 *        then start a fresh session here
 *      - Fork: fork session file to the spawned pi, keep current session here too
 *      - Seed: LLM creates focused handoff context from the current conversation
 *   2. Prompts for a short worktree/branch name (or auto-derives one)
 *   3. Creates a git worktree on a new branch from current HEAD
 *   4. Creates a tmux session in the worktree directory
 *   5. Launches `pi` inside that tmux with the appropriate context
 *
 * /spawn-list flow:
 *   1. Shows worktrees with pi/tmux status (working/idle/shell/none)
 *   2. Safety gate: blocks if pi is still active (working/idle), offers to kill
 *   3. Choose: merge into current branch, or discard
 *   4. Artifact audit: queries the spawned session for gitignored files to preserve
 *   5. Cleanup: kill tmux, migrate sessions, remove worktree, delete branch
 *
 * Worktrees are created at ../<project>-worktrees/<name> relative to the repo root.
 */

import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import {
	BorderedLoader,
	convertToLlm,
	serializeConversation,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { complete, type Message } from "@mariozechner/pi-ai";
import { execSync } from "node:child_process";
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

type SpawnMode = "resume" | "fork" | "seed" | "fresh";

const SEED_SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and a task description for a new agent session running in a separate git worktree, generate a focused handoff document.

The document should:
1. Summarize decisions made, approaches taken, and key findings relevant to the task
2. List files that were discussed, modified, or are relevant to the task
3. Include code snippets, design patterns, or architectural decisions that matter
4. Note any gotchas, constraints, or open questions discovered in the conversation
5. State the task clearly and concisely

Be selective — include only what's useful for the new session to hit the ground running on the task. Skip unrelated tangents.

Format your response as a self-contained briefing document. No preamble like "Here's the document" — just output the document itself.`;

function sh(cmd: string, cwd: string): string {
	try {
		return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (e: any) {
		throw new Error(`Command failed: ${cmd}\n${e.stderr || e.message}`);
	}
}

function shSafe(cmd: string, cwd: string): string {
	try {
		return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return "";
	}
}

function getRepoRoot(cwd: string): string | null {
	const root = shSafe("git rev-parse --show-toplevel", cwd);
	return root || null;
}

function getCurrentBranch(cwd: string): string {
	return shSafe("git branch --show-current", cwd) || "HEAD";
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
}

function tmuxSessionExists(name: string): boolean {
	try {
		execSync(`tmux has-session -t '${name}'`, { stdio: ["pipe", "pipe", "pipe"] });
		return true;
	} catch {
		return false;
	}
}

type TmuxStatus = "working" | "idle" | "shell" | "none";

/** Check tmux session status: is pi working, idle, exited to shell, or gone? */
function getTmuxStatus(name: string): TmuxStatus {
	if (!tmuxSessionExists(name)) return "none";
	try {
		// Get the pane's PID (the root shell process)
		const panePid = execSync(
			`tmux list-panes -t '${name}' -F '#{pane_pid}'`,
			{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();
		if (!panePid) return "shell";

		// Look for a pi process as a child of the pane shell.
		// Handles both direct launch (`pi ...`) and script launch (`bash launch.sh` → pi).
		const piPid = shSafe(`pgrep -P ${panePid} -x pi`, "/")
			|| shSafe(`pgrep -P ${panePid} -x node`, "/");
		const pid = piPid.split("\n")[0]?.trim();
		if (!pid) return "shell"; // no pi process → it exited, user is in shell

		// pi is running — check if it's actively working

		// Check 1: does pi have child processes? (tool execution — bash, etc.)
		const children = shSafe(`pgrep -P ${pid}`, "/");
		if (children.trim()) return "working";

		// Check 2: does pi have active TCP connections? (LLM streaming)
		const tcp = shSafe(`ss -tnp 2>/dev/null | grep "pid=${pid},"`, "/");
		if (tcp.trim()) return "working";

		return "idle";
	} catch {
		return "idle"; // session exists, can't determine — assume idle
	}
}

/** Shell-quote a string safely (handles single quotes, spaces, special chars). */
function shellQuote(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}

function findAgentsMd(repoRoot: string): string | null {
	const candidates = [
		join(repoRoot, "AGENTS.md"),
		join(repoRoot, ".agents", "AGENTS.md"),
		join(repoRoot, ".pi", "AGENTS.md"),
	];
	for (const path of candidates) {
		if (existsSync(path)) return path;
	}
	return null;
}

/**
 * Compute pi's default session directory for a given cwd.
 * Mirrors getDefaultSessionDir() in pi's session-manager.ts:
 *   ~/.pi/agent/sessions/--<cwd-with-slashes-replaced-by-dashes>--/
 */
function getSessionDirForCwd(cwd: string): string {
	const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(homedir(), ".pi", "agent", "sessions", safePath);
}

/**
 * Get the last entry ID from a session JSONL file (for parentId chaining).
 */
function getLastEntryId(filePath: string): string | null {
	const content = readFileSync(filePath, "utf-8").trim();
	const lines = content.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			const entry = JSON.parse(lines[i]);
			if (entry.id && entry.type !== "session") return entry.id;
		} catch {
			// skip malformed lines
		}
	}
	return null;
}

/**
 * Append a session_info entry to a session JSONL file to set its display name.
 */
function labelSessionFile(filePath: string, name: string): void {
	const lastId = getLastEntryId(filePath);
	if (!lastId) return; // empty session, nothing to label

	const entry = {
		type: "session_info",
		id: randomUUID().slice(0, 8),
		parentId: lastId,
		timestamp: new Date().toISOString(),
		name,
	};
	appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

/** Build a human-readable session label for a spawn worktree. */
function buildSpawnLabel(branchName: string, task: string): string {
	const truncatedTask = task.length > 60 ? task.slice(0, 57) + "..." : task;
	return `${branchName}: ${truncatedTask}`;
}

/**
 * Migrate session files from a worktree's session dir to the main project's session dir.
 * Optionally labels each migrated session with a display name.
 * Returns the number of files migrated.
 */
function migrateSessionFiles(
	worktreePath: string,
	projectRoot: string,
	label?: string,
): number {
	const srcDir = getSessionDirForCwd(worktreePath);
	const dstDir = getSessionDirForCwd(projectRoot);

	if (!existsSync(srcDir)) return 0;

	if (!existsSync(dstDir)) {
		mkdirSync(dstDir, { recursive: true });
	}

	const files = readdirSync(srcDir).filter((f) => f.endsWith(".jsonl"));
	for (const file of files) {
		const src = join(srcDir, file);
		const dst = join(dstDir, file);
		if (!existsSync(dst)) {
			// Label before copying so the name is baked into the migrated file
			if (label) {
				labelSessionFile(src, label);
			}
			copyFileSync(src, dst);
		}
	}

	// Clean up the now-empty worktree session dir
	if (files.length > 0) {
		try {
			rmSync(srcDir, { recursive: true });
		} catch {
			// non-critical — leave it
		}
	}

	return files.length;
}

/** Serialize the current conversation branch into readable text. */
function getConversationText(branch: SessionEntry[]): string | null {
	const messages = branch
		.filter((entry): entry is SessionEntry & { type: "message" } => entry.type === "message")
		.map((entry) => entry.message);

	if (messages.length === 0) return null;

	const llmMessages = convertToLlm(messages);
	return serializeConversation(llmMessages);
}

/**
 * Fork the current session file into a new session for the worktree.
 * Sets a display name on the forked session so it's identifiable in /resume.
 * Returns the forked session file path, or undefined if not persisted.
 */
function forkSessionForWorktree(
	sourceSessionFile: string,
	worktreeDir: string,
	sessionName?: string,
): string | undefined {
	const forked = SessionManager.forkFrom(sourceSessionFile, worktreeDir);
	if (sessionName) {
		forked.appendSessionInfo(sessionName);
	}
	return forked.getSessionFile();
}

/**
 * Build the system prompt context file for spawn metadata (branch info, AGENTS.md).
 * Does NOT include conversation text — that comes from the session file for Resume/Fork.
 */
function buildSpawnContext(
	parentBranch: string,
	branchName: string,
	task: string,
	repoRoot: string,
	extraContext?: string,
): string {
	const sections: string[] = [
		"# Spawn Context",
		"",
		`You are working in a git worktree spawned from branch \`${parentBranch}\`.`,
		`Your branch: \`${branchName}\``,
		`Parent branch: \`${parentBranch}\``,
		`Task: ${task}`,
		"",
		"When you're done, commit your changes. The user will merge the branch back.",
	];

	if (extraContext) {
		sections.push("", extraContext);
	}

	// Include AGENTS.md
	const agentsMdPath = findAgentsMd(repoRoot);
	if (agentsMdPath) {
		try {
			const agentsMd = readFileSync(agentsMdPath, "utf-8");
			sections.push("", "# Project AGENTS.md", "", agentsMd);
		} catch {
			// ignore read errors
		}
	}

	return sections.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("spawn", {
		description: "Create a git worktree + tmux session + pi instance for a task",
		handler: async (args, ctx) => {
			const task = args?.trim();
			if (!task) {
				ctx.ui.notify("Usage: /spawn <task description>", "warning");
				return;
			}

			const cwd = ctx.cwd;
			const repoRoot = getRepoRoot(cwd);
			if (!repoRoot) {
				ctx.ui.notify("Not in a git repository", "error");
				return;
			}

			const parentBranch = getCurrentBranch(cwd);
			const projectName = basename(repoRoot).replace(/^\.+/, "") || "project";

			// --- Mode selection ---
			const modeLabels = [
				"Resume — move conversation there (full session tree + /tree), fresh session here",
				"Fork — copy conversation there (full session tree + /tree), keep it here too",
				"Seed — LLM creates focused context for the task",
				"Fresh — new conversation with just the task prompt",
			];
			const modeChoice = await ctx.ui.select("Spawn mode:", modeLabels);
			if (!modeChoice) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}
			const mode: SpawnMode = modeChoice.startsWith("Resume")
				? "resume"
				: modeChoice.startsWith("Fork")
					? "fork"
					: modeChoice.startsWith("Seed")
						? "seed"
						: "fresh";

			// --- Prepare context based on mode ---
			const branch = ctx.sessionManager.getBranch();
			let forkedSessionPath: string | undefined;
			let seedContext: string | undefined;

			if (mode === "resume" || mode === "fork") {
				const sessionFile = ctx.sessionManager.getSessionFile();
				if (!sessionFile) {
					// Ephemeral session — can't fork the session file, fall back to text
					const conversationText = getConversationText(branch);
					if (conversationText) {
						seedContext =
							"# Conversation History from Parent Session\n\n" +
							"Below is the conversation from the session that spawned this worktree.\n" +
							"Continue from where it left off.\n\n" +
							conversationText;
						ctx.ui.notify(
							"Ephemeral session — conversation transferred as text (no session tree).",
							"warning",
						);
					} else {
						ctx.ui.notify(
							"No conversation to transfer — spawning with task only.",
							"warning",
						);
					}
				}
				// We'll fork after creating the worktree (need worktreeDir first)
			} else if (mode === "seed") {
				const rawConversation = getConversationText(branch);
				if (!rawConversation) {
					ctx.ui.notify(
						"No conversation history to seed from — spawning with task only.",
						"warning",
					);
				} else {
					if (!ctx.model) {
						ctx.ui.notify("No model selected — can't generate seed context", "error");
						return;
					}

					// Call LLM to generate focused handoff context
					const llmResult = await ctx.ui.custom<string | null>(
						(tui, theme, _kb, done) => {
							const loader = new BorderedLoader(
								tui,
								theme,
								"Generating handoff context...",
							);
							loader.onAbort = () => done(null);

							const generate = async () => {
								const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);
								const userMessage: Message = {
									role: "user",
									content: [
										{
											type: "text",
											text: `## Conversation History\n\n${rawConversation}\n\n## Task for New Session\n\n${task}`,
										},
									],
									timestamp: Date.now(),
								};

								const response = await complete(
									ctx.model!,
									{ systemPrompt: SEED_SYSTEM_PROMPT, messages: [userMessage] },
									{ apiKey, signal: loader.signal },
								);

								if (response.stopReason === "aborted") return null;

								return response.content
									.filter(
										(c): c is { type: "text"; text: string } =>
											c.type === "text",
									)
									.map((c) => c.text)
									.join("\n");
							};

							generate()
								.then(done)
								.catch((err) => {
									console.error("Seed context generation failed:", err);
									done(null);
								});

							return loader;
						},
					);

					if (llmResult === null) {
						ctx.ui.notify("Cancelled", "info");
						return;
					}

					// Let user review/edit the generated context
					const edited = await ctx.ui.editor("Edit handoff context:", llmResult);
					if (edited === undefined) {
						ctx.ui.notify("Cancelled", "info");
						return;
					}

					seedContext = "# Handoff Context from Parent Session\n\n" + edited;
				}
			}

			// --- Worktree name ---
			const suggestedSlug = slugify(task);
			const name = await ctx.ui.input("Worktree name:", suggestedSlug);

			if (!name?.trim()) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			const worktreeName = slugify(name.trim());
			if (!worktreeName) {
				ctx.ui.notify("Invalid name — must contain alphanumeric characters", "error");
				return;
			}

			const branchName = `spawn/${worktreeName}`;
			const worktreeDir = resolve(repoRoot, "..", `${projectName}-worktrees`, worktreeName);
			const tmuxSession = `${projectName}-${worktreeName}`;

			// --- Validate ---
			if (existsSync(worktreeDir)) {
				ctx.ui.notify(`Worktree directory already exists: ${worktreeDir}`, "error");
				return;
			}

			const existingBranch = shSafe(
				`git show-ref --verify refs/heads/${branchName}`,
				cwd,
			);
			if (existingBranch) {
				ctx.ui.notify(`Branch ${branchName} already exists`, "error");
				return;
			}

			if (tmuxSessionExists(tmuxSession)) {
				ctx.ui.notify(`tmux session ${tmuxSession} already exists`, "error");
				return;
			}

			// --- Confirm ---
			const modeDescriptions: Record<SpawnMode, string> = {
				resume: "Resume (fork session there, fresh session here)",
				fork: "Fork (fork session there, keep it here)",
				seed: "Seed (LLM-curated context)",
				fresh: "Fresh (new conversation, task only)",
			};
			const confirmed = await ctx.ui.confirm(
				"Spawn worktree?",
				[
					`Task: ${task}`,
					`Mode: ${modeDescriptions[mode]}`,
					`Branch: ${branchName} (from ${parentBranch})`,
					`Worktree: ${worktreeDir}`,
					`tmux session: ${tmuxSession}`,
				].join("\n"),
			);

			if (!confirmed) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			// --- Create worktree ---
			const worktreeParent = dirname(worktreeDir);
			if (!existsSync(worktreeParent)) {
				mkdirSync(worktreeParent, { recursive: true });
			}

			try {
				sh(`git worktree add -b ${branchName} "${worktreeDir}"`, cwd);
			} catch (e: any) {
				ctx.ui.notify(`Failed to create worktree: ${e.message}`, "error");
				return;
			}

			// --- Fork session file for Resume/Fork (now that worktreeDir exists) ---
			if ((mode === "resume" || mode === "fork") && !seedContext) {
				const sessionFile = ctx.sessionManager.getSessionFile();
				if (sessionFile) {
					try {
						const label = buildSpawnLabel(branchName, task);
						forkedSessionPath = forkSessionForWorktree(sessionFile, worktreeDir, label);
					} catch (e: any) {
						ctx.ui.notify(
							`Failed to fork session: ${e.message}. Falling back to text mode.`,
							"warning",
						);
						const conversationText = getConversationText(branch);
						if (conversationText) {
							seedContext =
								"# Conversation History from Parent Session\n\n" +
								conversationText;
						}
					}
				}
			}

			// --- Build system prompt context ---
			const spawnContext = buildSpawnContext(
				parentBranch,
				branchName,
				task,
				repoRoot,
				seedContext,
			);

			// Write system prompt to temp file
			const tmpDir = join(tmpdir(), `pi-spawn-${worktreeName}`);
			mkdirSync(tmpDir, { recursive: true });
			const promptFile = join(tmpDir, "spawn-context.md");
			writeFileSync(promptFile, spawnContext, "utf-8");

			// --- Launch pi in tmux ---
			// Write a launcher script to avoid shell quoting issues with tmux
			const launcherScript = join(tmpDir, "launch.sh");
			const launcherLines: string[] = ["#!/usr/bin/env bash", ""];
			if (forkedSessionPath) {
				// Resume/Fork: open the forked session file, send task as new message
				launcherLines.push(
					`pi --session ${shellQuote(forkedSessionPath)} --append-system-prompt ${shellQuote(promptFile)} ${shellQuote(task)}`,
				);
			} else {
				// Seed or fallback: fresh session with context in system prompt
				launcherLines.push(
					`pi --append-system-prompt ${shellQuote(promptFile)} ${shellQuote(task)}`,
				);
			}
			launcherLines.push(
				"",
				'echo ""',
				'echo "[pi exited — you are in the worktree shell. Exit to close tmux session.]"',
				"exec $SHELL",
			);
			writeFileSync(launcherScript, launcherLines.join("\n"), { mode: 0o755 });

			try {
				sh(
					`tmux new-session -d -s ${shellQuote(tmuxSession)} -c ${shellQuote(worktreeDir)} ${shellQuote(launcherScript)}`,
					cwd,
				);
			} catch (e: any) {
				ctx.ui.notify(`Failed to create tmux session: ${e.message}`, "error");
				shSafe(`git worktree remove "${worktreeDir}"`, cwd);
				return;
			}

			ctx.ui.notify(`Spawned! tmux attach -t ${tmuxSession}`, "success");

			// Tell the current agent about it
			pi.sendMessage({
				customType: "spawn",
				content: [
					`Spawned a new pi session for: ${task}`,
					``,
					`- Mode: ${modeDescriptions[mode]}`,
					`- Branch: \`${branchName}\` (from \`${parentBranch}\`)`,
					`- Worktree: \`${worktreeDir}\``,
					`- tmux: \`tmux attach -t ${tmuxSession}\``,
					forkedSessionPath
						? `- Session: forked to \`${forkedSessionPath}\``
						: "",
					``,
					`When the task is done, merge with:`,
					`\`\`\``,
					`git merge ${branchName}`,
					`git worktree remove "${worktreeDir}"`,
					`git branch -d ${branchName}`,
					`\`\`\``,
				]
					.filter(Boolean)
					.join("\n"),
				display: true,
			});

			// --- For Resume mode: create a fresh session here ---
			if (mode === "resume") {
				const currentSessionFile = ctx.sessionManager.getSessionFile();
				const result = await ctx.newSession({
					parentSession: currentSessionFile,
				});
				if (result.cancelled) {
					ctx.ui.notify(
						"New session creation was cancelled — you're still in the old session",
						"warning",
					);
				} else {
					ctx.ui.notify(
						"Started fresh session. The previous conversation continues in the spawned window.",
						"info",
					);
				}
			}
		},
	});

	// Command to list, merge, and clean up spawn worktrees
	pi.registerCommand("spawn-list", {
		description: "List spawn worktrees — select one to merge or clean up",
		handler: async (_args, ctx) => {
			const cwd = ctx.cwd;
			const repoRoot = getRepoRoot(cwd);
			if (!repoRoot) {
				ctx.ui.notify("Not in a git repository", "error");
				return;
			}

			// --- Parse worktrees ---
			const worktreeList = shSafe("git worktree list --porcelain", cwd);
			if (!worktreeList) {
				ctx.ui.notify("No worktrees found", "info");
				return;
			}

			const worktrees: { path: string; branch: string; head: string }[] = [];
			let current: Partial<{ path: string; branch: string; head: string }> = {};
			for (const line of worktreeList.split("\n")) {
				if (line.startsWith("worktree ")) {
					if (current.path) worktrees.push(current as any);
					current = { path: line.slice(9) };
				} else if (line.startsWith("HEAD ")) {
					current.head = line.slice(5);
				} else if (line.startsWith("branch ")) {
					current.branch = line.slice(7).replace("refs/heads/", "");
				} else if (line === "") {
					if (current.path) worktrees.push(current as any);
					current = {};
				}
			}
			if (current.path) worktrees.push(current as any);

			const spawnWorktrees = worktrees.filter((w) => w.branch?.startsWith("spawn/"));
			if (spawnWorktrees.length === 0) {
				ctx.ui.notify("No active spawn worktrees", "info");
				return;
			}

			const projectName = basename(repoRoot).replace(/^\.+/, "") || "project";

			// --- Select worktree ---
			const items = spawnWorktrees.map((w) => {
				const name = w.branch.replace("spawn/", "");
				const tmuxName = `${projectName}-${name}`;
				const status = getTmuxStatus(tmuxName);
				const statusIcon =
					status === "working"
						? "● working"
						: status === "idle"
							? "◑ idle"
							: status === "shell"
								? "○ shell"
								: "○ no tmux";
				return `${w.branch}  ${statusIcon}  (${w.path})`;
			});

			const choice = await ctx.ui.select("Spawn worktrees:", items);
			if (!choice) return;

			const selectedBranch = choice.split(/\s/)[0];
			const wt = spawnWorktrees.find((w) => w.branch === selectedBranch);
			if (!wt) return;

			const name = selectedBranch.replace("spawn/", "");
			const tmuxName = `${projectName}-${name}`;
			const piStatus = getTmuxStatus(tmuxName);

			// --- Safety gate: block if pi is still active ---
			if (piStatus === "working" || piStatus === "idle") {
				const statusDesc = piStatus === "working"
					? "pi is actively working"
					: "pi is running (idle)";
				const killAndContinue = await ctx.ui.confirm(
					`${statusDesc} in tmux session ${tmuxName}`,
					"Kill the session and continue, or cancel?",
				);
				if (!killAndContinue) return;

				shSafe(`tmux kill-session -t '${tmuxName}'`, cwd);
				ctx.ui.notify(`Killed tmux session ${tmuxName}`, "info");
			} else if (piStatus === "shell") {
				// pi exited but shell is open — just inform, will kill during cleanup
				ctx.ui.notify(
					`tmux session ${tmuxName} is open (pi exited). It will be closed during cleanup.`,
					"info",
				);
			}

			// --- Choose action: merge, discard, or cancel ---
			const currentBranch = getCurrentBranch(cwd);
			const actionChoice = await ctx.ui.select(
				`What to do with ${selectedBranch}?`,
				[
					`Merge into ${currentBranch} and clean up`,
					"Discard (clean up without merging)",
					"Cancel",
				],
			);
			if (!actionChoice || actionChoice === "Cancel") return;

			const shouldMerge = actionChoice.startsWith("Merge");

			// --- Artifact audit via spawned session ---
			const sessionDir = getSessionDirForCwd(wt.path);
			let auditResult: string | null = null;

			if (existsSync(sessionDir)) {
				const sessionFiles = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
				if (sessionFiles.length > 0) {
					const runAudit = await ctx.ui.confirm(
						"Run artifact audit?",
						"Query the spawned session for gitignored files worth preserving " +
						"(checkpoints, data, embeddings, etc.)",
					);

					if (runAudit) {
						const sessionFile = join(sessionDir, sessionFiles[sessionFiles.length - 1]);
						const auditPrompt = [
							"I'm about to remove this worktree directory. Before I do, I need to know what files to preserve.",
							"",
							"Based on our conversation history, list every file that:",
							"1. Was created, downloaded, trained, or generated during this session",
							"2. Would be expensive or time-consuming to reproduce (training runs, large downloads, computed embeddings, etc.)",
							"3. Might be too large to track in git",
							"",
							"For each file, include:",
							"- Path (relative to the worktree root)",
							"- What it is / how it was created",
							"- Whether it should be copied to the main repo, or is safe to discard (reproducible quickly)",
							"",
							"Do NOT list files that are part of the git history (committed source code). Focus on gitignored artifacts, outputs, and data files.",
							"If there are no such files, just say 'No artifacts to preserve.'",
						].join("\n");

						try {
							const piOutput = execSync(
								`pi -p --session ${shellQuote(sessionFile)} --no-tools --no-extensions --no-skills --no-prompt-templates ${shellQuote(auditPrompt)}`,
								{ encoding: "utf-8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] },
							).trim();

							if (piOutput && !piOutput.toLowerCase().includes("no artifacts to preserve")) {
								auditResult = piOutput;
							}
						} catch (e: any) {
							ctx.ui.notify(
								`Artifact audit failed: ${e.message?.slice(0, 100)}. Continuing without audit.`,
								"warning",
							);
						}
					}
				}
			}

			if (auditResult) {
				const reviewed = await ctx.ui.editor(
					"Artifact audit — review what the spawned session reported:",
					auditResult,
				);
				// Editor result is informational — user reads it and decides.
				// If they cancel the editor, we still continue (they saw the info).
			}

			// --- Merge if requested ---
			if (shouldMerge) {
				try {
					sh(`git merge ${selectedBranch} --no-edit`, cwd);
					ctx.ui.notify(`Merged ${selectedBranch} into ${currentBranch}`, "success");
				} catch (e: any) {
					ctx.ui.notify(
						`Merge failed: ${e.message}\n\nResolve conflicts manually, then run /spawn-list again to clean up.`,
						"error",
					);
					return;
				}
			}

			// --- Cleanup ---
			const actions: string[] = [];

			// Kill tmux session if still around
			if (tmuxSessionExists(tmuxName)) {
				shSafe(`tmux kill-session -t '${tmuxName}'`, cwd);
				actions.push(`killed tmux ${tmuxName}`);
			}

			// Migrate session files before removing the worktree
			const label = selectedBranch;
			const migrated = migrateSessionFiles(wt.path, repoRoot, label);
			if (migrated > 0) {
				actions.push(`migrated ${migrated} session${migrated > 1 ? "s" : ""}`);
			}

			// Remove worktree (no --force: should be clean after merge/audit)
			const removeResult = shSafe(`git worktree remove "${wt.path}"`, cwd);
			if (removeResult === "" && existsSync(wt.path)) {
				// Remove failed silently (dirty worktree) — ask before forcing
				const forceRemove = await ctx.ui.confirm(
					"Worktree has uncommitted or untracked files",
					`Force remove ${wt.path}? Untracked files will be lost.`,
				);
				if (!forceRemove) {
					ctx.ui.notify(
						`Worktree kept at ${wt.path}. Clean it up manually and retry.`,
						"warning",
					);
					return;
				}
				shSafe(`git worktree remove --force "${wt.path}"`, cwd);
			}
			actions.push(`removed worktree`);

			// Delete branch: -d after merge (safe), -D for discard (intentional)
			const branchFlag = shouldMerge ? "-d" : "-D";
			shSafe(`git branch ${branchFlag} ${selectedBranch}`, cwd);
			actions.push(`deleted branch ${selectedBranch}`);

			const verb = shouldMerge ? "Merged and cleaned up" : "Discarded";
			ctx.ui.notify(`${verb} ${selectedBranch} (${actions.join(", ")})`, "success");

			// Inform the agent
			pi.sendMessage({
				customType: "spawn-close",
				content: [
					`${verb} spawn worktree: ${selectedBranch}`,
					``,
					`Actions taken:`,
					...actions.map((a) => `- ${a}`),
					shouldMerge ? `\nBranch was merged into \`${currentBranch}\`.` : "",
				]
					.filter(Boolean)
					.join("\n"),
				display: true,
			});
		},
	});
}
