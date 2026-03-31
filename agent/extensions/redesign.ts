/**
 * Redesign extension — interactive branch comparison and merge for the redesign skill.
 *
 * Provides:
 *   - `redesign_compare` tool (agent-callable) — shows branch comparison viewer
 *   - `/redesign-compare` command (user-callable) — same viewer
 *   - `/redesign-merge` command — pick a branch and merge it
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { Container, matchesKey, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";

// ── Git helpers ──────────────────────────────────────────────────────────────

function git(cmd: string, cwd: string): string {
	try {
		return execSync(`git ${cmd}`, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch {
		return "";
	}
}

interface BranchInfo {
	name: string;
	files: number;
	insertions: number;
	deletions: number;
	stat: string;
}

function getRedesignBranches(cwd: string, prefix: string = "redesign/"): string[] {
	const raw = git(`branch --list '${prefix}*' --format='%(refname:short)'`, cwd);
	if (!raw) return [];
	return raw.split("\n").filter(Boolean);
}

function getCurrentBranch(cwd: string): string {
	return git("branch --show-current", cwd);
}

function getBranchInfo(cwd: string, base: string, branch: string): BranchInfo {
	const stat = git(`diff --stat ${base}..${branch}`, cwd);
	const shortstat = git(`diff --shortstat ${base}..${branch}`, cwd);

	let files = 0,
		insertions = 0,
		deletions = 0;
	const fm = shortstat.match(/(\d+) file/);
	const im = shortstat.match(/(\d+) insertion/);
	const dm = shortstat.match(/(\d+) deletion/);
	if (fm) files = parseInt(fm[1]);
	if (im) insertions = parseInt(im[1]);
	if (dm) deletions = parseInt(dm[1]);

	return { name: branch, files, insertions, deletions, stat };
}

function getBranchDiff(cwd: string, base: string, branch: string): string {
	return git(`diff ${base}..${branch}`, cwd);
}

// ── Diff viewer component ────────────────────────────────────────────────────

function colorDiffLine(line: string, theme: any): string {
	if (line.startsWith("+++ ") || line.startsWith("--- ")) {
		return theme.bold(line);
	} else if (line.startsWith("+")) {
		return theme.fg("toolDiffAdded", line);
	} else if (line.startsWith("-")) {
		return theme.fg("toolDiffRemoved", line);
	} else if (line.startsWith("@@")) {
		return theme.fg("accent", line);
	} else if (line.startsWith("diff --git")) {
		return theme.fg("accent", theme.bold(line));
	}
	return line;
}

// ── Shared viewer logic ──────────────────────────────────────────────────────

async function showBranchViewer(
	ctx: any,
	cwd: string,
	baseBranch: string,
	branches: BranchInfo[],
): Promise<string | null> {
	// Returns the branch name the user wants to merge, or null
	let selectedBranch: string | null = null;

	while (true) {
		// Phase 1: Branch selector
		const items: SelectItem[] = branches.map((b) => ({
			value: b.name,
			label: b.name,
			description: `${b.files} files  +${b.insertions} -${b.deletions}`,
		}));

		const picked = await ctx.ui.custom<string | null>((tui: any, theme: any, _kb: any, done: (v: string | null) => void) => {
			const container = new Container();

			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold("Redesign Branches")) +
						theme.fg("dim", `  (base: ${baseBranch})`),
					1,
					0,
				),
			);

			const selectList = new SelectList(items, Math.min(items.length + 2, 15), {
				selectedPrefix: (t: string) => theme.fg("accent", t),
				selectedText: (t: string) => theme.fg("accent", t),
				description: (t: string) => theme.fg("muted", t),
				scrollInfo: (t: string) => theme.fg("dim", t),
				noMatch: (t: string) => theme.fg("warning", t),
			});
			selectList.onSelect = (item: SelectItem) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);

			container.addChild(
				new Text(theme.fg("dim", "↑↓ navigate • enter view diff • esc quit"), 1, 0),
			);
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (w: number) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (picked === null) break;

		// Phase 2: Diff viewer for selected branch
		const diff = getBranchDiff(cwd, baseBranch, picked);
		const diffLines = diff ? diff.split("\n") : ["(no changes)"];
		const branchInfo = branches.find((b) => b.name === picked)!;

		const action = await ctx.ui.custom<string>((tui: any, theme: any, _kb: any, done: (v: string) => void) => {
			let scrollOffset = 0;

			return {
				render(width: number): string[] {
					const lines: string[] = [];

					// Header
					const headerBorder = theme.fg("accent", "─".repeat(width));
					lines.push(headerBorder);

					const header =
						theme.fg("accent", theme.bold(` ${picked}`)) +
						theme.fg("dim", `  ${branchInfo.files} files  +${branchInfo.insertions} -${branchInfo.deletions}`);
					lines.push(header);
					lines.push(headerBorder);

					// Calculate visible area (leave room for header + footer)
					// We don't know terminal height, so use a reasonable chunk
					// The TUI will clip to terminal height anyway
					const maxVisible = 200;
					const visible = diffLines.slice(scrollOffset, scrollOffset + maxVisible);

					for (const line of visible) {
						const colored = colorDiffLine(line, theme);
						lines.push(" " + colored);
					}

					// Footer
					lines.push(headerBorder);
					const pos = `${scrollOffset + 1}–${Math.min(scrollOffset + maxVisible, diffLines.length)} of ${diffLines.length}`;
					lines.push(
						theme.fg("dim", ` ↑↓/j/k scroll • m merge this branch • esc back • q quit`) +
							"  " +
							theme.fg("muted", pos),
					);
					lines.push(headerBorder);

					return lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (matchesKey(data, "escape")) {
						done("back");
					} else if (data === "q") {
						done("quit");
					} else if (data === "m") {
						done("merge");
					} else if (matchesKey(data, "up") || data === "k") {
						if (scrollOffset > 0) {
							scrollOffset -= 3;
							if (scrollOffset < 0) scrollOffset = 0;
							tui.requestRender();
						}
					} else if (matchesKey(data, "down") || data === "j") {
						if (scrollOffset < diffLines.length - 10) {
							scrollOffset += 3;
							tui.requestRender();
						}
					} else if (matchesKey(data, "pageup")) {
						scrollOffset = Math.max(0, scrollOffset - 30);
						tui.requestRender();
					} else if (matchesKey(data, "pagedown")) {
						scrollOffset = Math.min(diffLines.length - 10, scrollOffset + 30);
						if (scrollOffset < 0) scrollOffset = 0;
						tui.requestRender();
					}
				},
			};
		});

		if (action === "quit") break;
		if (action === "merge") {
			selectedBranch = picked;
			break;
		}
		// action === "back" → loop to selector
	}

	return selectedBranch;
}

// ── Merge helper ─────────────────────────────────────────────────────────────

async function doMerge(
	ctx: any,
	cwd: string,
	baseBranch: string,
	branch: string,
	allBranches: string[],
): Promise<void> {
	const ok = await ctx.ui.confirm("Merge branch?", `Merge ${branch} into ${baseBranch}?`);
	if (!ok) return;

	// Checkout base and merge
	git(`checkout ${baseBranch}`, cwd);
	const result = git(`merge ${branch}`, cwd);
	if (!result && git("status --porcelain", cwd).includes("UU")) {
		ctx.ui.notify("Merge conflict! Resolve manually.", "error");
		return;
	}
	ctx.ui.notify(`Merged ${branch} into ${baseBranch}`, "success");

	// Offer to delete other branches
	const others = allBranches.filter((b) => b !== branch);
	if (others.length > 0) {
		const cleanup = await ctx.ui.confirm(
			"Clean up?",
			`Delete ${others.length} other redesign branch(es)?\n${others.join("\n")}`,
		);
		if (cleanup) {
			for (const b of others) {
				git(`branch -D ${b}`, cwd);
			}
			ctx.ui.notify(`Deleted ${others.length} branch(es)`, "info");
		}
	}

	// Delete the merged branch too
	const deleteMerged = await ctx.ui.confirm("Delete merged branch?", `Delete ${branch}?`);
	if (deleteMerged) {
		git(`branch -D ${branch}`, cwd);
		ctx.ui.notify(`Deleted ${branch}`, "info");
	}
}

// ── Extension entry ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Tool: redesign_compare — agent calls this after implementing branches
	pi.registerTool({
		name: "redesign_compare",
		label: "Compare Redesign Branches",
		description:
			"Show an interactive comparison viewer for redesign branches. Call after implementing all redesign branches. Opens a branch selector where the user can view diffs and optionally merge.",
		parameters: Type.Object({
			base_branch: Type.String({
				description: "The base branch to diff against (e.g. main)",
			}),
			prefix: Type.Optional(
				Type.String({
					description: "Branch prefix to filter (default: redesign/)",
				}),
			),
		}),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const cwd = ctx.cwd;
			const baseBranch = params.base_branch;
			const prefix = params.prefix || "redesign/";

			const branchNames = getRedesignBranches(cwd, prefix);
			if (branchNames.length === 0) {
				return {
					content: [{ type: "text", text: `No branches found matching ${prefix}*` }],
					details: {},
				};
			}

			const branches = branchNames.map((b) => getBranchInfo(cwd, baseBranch, b));

			// Build summary for the LLM
			let summary = `Found ${branches.length} redesign branch(es) (base: ${baseBranch}):\n\n`;
			for (const b of branches) {
				summary += `• ${b.name} — ${b.files} files, +${b.insertions} -${b.deletions}\n`;
			}

			// Open interactive viewer if we have UI
			if (ctx.hasUI) {
				// Make sure we're on the base branch for clean diffs
				git(`checkout ${baseBranch}`, cwd);

				const merged = await showBranchViewer(ctx, cwd, baseBranch, branches);
				if (merged) {
					await doMerge(ctx, cwd, baseBranch, merged, branchNames);
					summary += `\nUser merged: ${merged}`;
				} else {
					summary += "\nUser is still reviewing.";
				}
			} else {
				summary += "\n(Non-interactive mode — use /redesign-compare to review)";
			}

			return {
				content: [{ type: "text", text: summary }],
				details: { branches: branches.map((b) => b.name), baseBranch },
			};
		},
	});

	// Command: /redesign-compare
	pi.registerCommand("redesign-compare", {
		description: "Compare redesign branches interactively",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Requires interactive mode", "error");
				return;
			}

			const cwd = ctx.cwd;
			const baseBranch = args.trim() || getCurrentBranch(cwd) || "main";
			const branchNames = getRedesignBranches(cwd);

			if (branchNames.length === 0) {
				ctx.ui.notify("No redesign/* branches found", "warning");
				return;
			}

			const branches = branchNames.map((b) => getBranchInfo(cwd, baseBranch, b));
			const merged = await showBranchViewer(ctx, cwd, baseBranch, branches);

			if (merged) {
				await doMerge(ctx, cwd, baseBranch, merged, branchNames);
			}
		},
	});

	// Command: /redesign-merge
	pi.registerCommand("redesign-merge", {
		description: "Merge a redesign branch into the base branch",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Requires interactive mode", "error");
				return;
			}

			const cwd = ctx.cwd;
			const baseBranch = args.trim() || getCurrentBranch(cwd) || "main";
			const branchNames = getRedesignBranches(cwd);

			if (branchNames.length === 0) {
				ctx.ui.notify("No redesign/* branches found", "warning");
				return;
			}

			const branches = branchNames.map((b) => getBranchInfo(cwd, baseBranch, b));
			const items = branches.map(
				(b) => `${b.name}  (${b.files} files, +${b.insertions} -${b.deletions})`,
			);

			const choice = await ctx.ui.select("Merge which branch?", items);
			if (!choice) return;

			// Extract branch name from the selection string
			const branch = choice.split("  (")[0];
			await doMerge(ctx, cwd, baseBranch, branch, branchNames);
		},
	});
}
