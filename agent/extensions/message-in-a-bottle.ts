/**
 * TODO[pi] Finder Extension
 *
 * Scans the current project for lines containing "TODO[pi]" and presents them
 * in an interactive multi-select list. Selected items are sent to the agent
 * as a user message to work on.
 *
 * Search uses `rg` (ripgrep), which respects .gitignore by default — so
 * node_modules, data files, build artifacts, etc. are automatically excluded.
 * Falls back to grep if rg is not available.
 *
 * Usage: /message-in-a-bottle [path]
 *
 * If path is given (file or folder), only that target is searched.
 * Otherwise the entire project (ctx.cwd) is searched.
 *
 * Controls:
 *   ↑/↓     navigate
 *   space   mark to WORK ON (green ✓)
 *   r       mark to REMOVE (red ✗)
 *   a       select all for work / clear all
 *   enter   confirm and send to agent
 *   esc     cancel
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface TodoItem {
	file: string;
	line: number;
	content: string;
}

type SelectionMode = "work" | "remove";

interface Selection {
	index: number;
	mode: SelectionMode;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("message-in-a-bottle", {
		description: "Find TODO[pi] items and select which ones to work on or remove. Optional: path to search.",
		handler: async (args, ctx) => {
			const searchPath = args.trim() || "";
			const pathSuffix = searchPath ? ` ${searchPath}` : "";

			// Search using grep (rg preferred but grep as fallback)
			let stdout: string;
			try {
				stdout = execSync(
					`rg --with-filename --no-heading --line-number --column --color=never --max-columns=500 --fixed-strings "TODO[pi]"${pathSuffix}`,
					{ cwd: ctx.cwd, encoding: "utf-8", timeout: 10000 },
				);
			} catch {
				try {
					const grepTarget = searchPath || ".";
					stdout = execSync(
						`grep -rHn --include="*.py" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.rs" --include="*.go" --include="*.java" --include="*.c" --include="*.cpp" --include="*.h" --include="*.md" --include="*.toml" --include="*.yaml" --include="*.yml" --include="*.json" --include="*.sh" --include="*.rb" --include="*.ex" --include="*.exs" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=__pycache__ --exclude-dir=.venv --exclude-dir=venv --exclude-dir=dist --exclude-dir=build --exclude-dir=target "TODO\\[pi\\]" ${grepTarget}`,
						{ cwd: ctx.cwd, encoding: "utf-8", timeout: 10000 },
					);
				} catch {
					ctx.ui.notify("No TODO[pi] items found in this project.", "info");
					return;
				}
			}

			if (!stdout.trim()) {
				ctx.ui.notify("No TODO[pi] items found in this project.", "info");
				return;
			}

			const lines = stdout.trim().split("\n").filter(Boolean);

			// Parse into structured items
			const items: TodoItem[] = [];
			for (const line of lines) {
				const match = line.match(/^\.?\/?([^:]+):(\d+):(?:\d+:)?(.*)$/);
				if (match) {
					items.push({
						file: match[1],
						line: parseInt(match[2]),
						content: match[3].trim(),
					});
				}
			}

			if (items.length === 0) {
				ctx.ui.notify("No TODO[pi] items found.", "info");
				return;
			}

			// Cache for file contents (for context preview)
			const fileCache = new Map<string, string[]>();
			function getFileLines(file: string): string[] {
				if (!fileCache.has(file)) {
					try {
						const content = readFileSync(join(ctx.cwd, file), "utf-8");
						fileCache.set(file, content.split("\n"));
					} catch {
						fileCache.set(file, []);
					}
				}
				return fileCache.get(file)!;
			}

			function getContext(item: TodoItem, linesBefore = 2, linesAfter = 2): string[] {
				const fileLines = getFileLines(item.file);
				const result: string[] = [];
				const start = Math.max(0, item.line - 1 - linesBefore);
				const end = Math.min(fileLines.length, item.line + linesAfter);
				for (let i = start; i < end; i++) {
					const lineNum = i + 1;
					const prefix = lineNum === item.line ? "→" : " ";
					result.push({ lineNum, prefix, text: fileLines[i] || "" } as any);
				}
				return result.map((l: any) => `${l.prefix} ${String(l.lineNum).padStart(4)} │ ${l.text}`);
			}

			// Show multi-select UI
			const result = await ctx.ui.custom<{ toWork: TodoItem[]; toRemove: TodoItem[] } | null>(
				(tui, theme, _kb, done) => {
					const selections = new Map<number, SelectionMode>(); // index -> mode
					let cursor = 0;
					let scrollOffset = 0;
					let cachedWidth: number | undefined;
					let cachedLines: string[] | undefined;
					let lastCursor = -1;

					const contextLines = 2;
					const chromeLines = 10 + contextLines * 2 + 3; // header + footer + context box

					function clampScroll(visibleCount: number) {
						if (cursor < scrollOffset) scrollOffset = cursor;
						if (cursor >= scrollOffset + visibleCount) scrollOffset = cursor - visibleCount + 1;
						if (scrollOffset < 0) scrollOffset = 0;
					}

					function countByMode(mode: SelectionMode): number {
						let count = 0;
						for (const m of selections.values()) {
							if (m === mode) count++;
						}
						return count;
					}

					return {
						handleInput(data: string) {
							if (matchesKey(data, Key.up) && cursor > 0) {
								cursor--;
							} else if (matchesKey(data, Key.down) && cursor < items.length - 1) {
								cursor++;
							} else if (matchesKey(data, Key.space)) {
								// Toggle work mode
								if (selections.get(cursor) === "work") {
									selections.delete(cursor);
								} else {
									selections.set(cursor, "work");
								}
							} else if (data === "r") {
								// Toggle remove mode
								if (selections.get(cursor) === "remove") {
									selections.delete(cursor);
								} else {
									selections.set(cursor, "remove");
								}
							} else if (data === "a") {
								// Select all for work / clear all
								if (selections.size === items.length) {
									selections.clear();
								} else {
									items.forEach((_, i) => selections.set(i, "work"));
								}
							} else if (matchesKey(data, Key.enter)) {
								if (selections.size === 0) {
									done(null);
								} else {
									const toWork: TodoItem[] = [];
									const toRemove: TodoItem[] = [];
									for (const [idx, mode] of selections) {
										if (mode === "work") toWork.push(items[idx]);
										else toRemove.push(items[idx]);
									}
									done({ toWork, toRemove });
								}
								return;
							} else if (matchesKey(data, Key.escape)) {
								done(null);
								return;
							} else {
								return;
							}
							cachedWidth = undefined;
							tui.requestRender();
						},

						render(width: number): string[] {
							// Invalidate cache if cursor changed (context needs updating)
							if (cursor !== lastCursor) {
								cachedWidth = undefined;
								lastCursor = cursor;
							}
							if (cachedLines && cachedWidth === width) return cachedLines;

							const termHeight = tui.rows ?? 40;
							const maxVisible = Math.max(3, termHeight - chromeLines);
							const visibleCount = Math.min(items.length, maxVisible);
							clampScroll(visibleCount);

							const out: string[] = [];
							const border = theme.fg("accent", "─".repeat(width));

							// Header
							out.push(border);
							const workCount = countByMode("work");
							const removeCount = countByMode("remove");
							const stats = [
								theme.fg("dim", `${items.length} found`),
								workCount > 0 ? theme.fg("success", `${workCount} to work`) : null,
								removeCount > 0 ? theme.fg("error", `${removeCount} to remove`) : null,
							]
								.filter(Boolean)
								.join("  ");
							const title = ` TODO[pi]  ${stats} `;
							out.push(truncateToWidth(theme.fg("accent", theme.bold(title)), width));
							out.push("");

							// Items
							const end = Math.min(scrollOffset + visibleCount, items.length);
							for (let i = scrollOffset; i < end; i++) {
								const item = items[i];
								const isCursor = i === cursor;
								const mode = selections.get(i);

								const pointer = isCursor ? "▸" : " ";
								let check: string;
								if (mode === "work") {
									check = theme.fg("success", "✓");
								} else if (mode === "remove") {
									check = theme.fg("error", "✗");
								} else {
									check = theme.fg("dim", "○");
								}
								const loc = theme.fg("muted", `${item.file}:${item.line}`);
								const text = item.content;

								const line = ` ${isCursor ? theme.fg("accent", pointer) : pointer} ${check} ${loc}  ${text}`;
								out.push(truncateToWidth(line, width));
							}

							// Scroll indicator
							if (items.length > visibleCount) {
								const above = scrollOffset;
								const below = items.length - end;
								const parts: string[] = [];
								if (above > 0) parts.push(`↑ ${above} above`);
								if (below > 0) parts.push(`↓ ${below} below`);
								out.push(truncateToWidth(theme.fg("dim", `   ${parts.join("  •  ")}`), width));
							}

							// Context preview for current item
							out.push("");
							out.push(theme.fg("muted", "─".repeat(Math.min(width, 60))));
							const currentItem = items[cursor];
							const context = getContext(currentItem, contextLines, contextLines);
							for (const line of context) {
								const isCurrentLine = line.startsWith("→");
								const styled = isCurrentLine ? theme.fg("accent", line) : theme.fg("dim", line);
								out.push(truncateToWidth(styled, width));
							}
							out.push(theme.fg("muted", "─".repeat(Math.min(width, 60))));

							// Footer
							out.push("");
							out.push(
								truncateToWidth(
									theme.fg("dim", " ↑↓ navigate • space work • r remove • a all • enter confirm • esc cancel"),
									width,
								),
							);
							out.push(border);

							cachedWidth = width;
							cachedLines = out;
							return out;
						},

						invalidate() {
							cachedWidth = undefined;
							cachedLines = undefined;
						},
					};
				},
			);

			if (!result || (result.toWork.length === 0 && result.toRemove.length === 0)) {
				ctx.ui.notify("No TODOs selected.", "info");
				return;
			}

			// Build message for agent
			const parts: string[] = [];

			if (result.toWork.length > 0) {
				const todoList = result.toWork.map((t) => `- \`${t.file}:${t.line}\`: ${t.content}`).join("\n");
				parts.push(
					`## TODOs to WORK ON\n\nFor each of these, read the relevant file for context, implement what the TODO asks for, and remove the TODO[pi] comment when done:\n\n${todoList}`,
				);
			}

			if (result.toRemove.length > 0) {
				const removeList = result.toRemove.map((t) => `- \`${t.file}:${t.line}\``).join("\n");
				parts.push(
					`## TODOs to REMOVE\n\nJust delete these TODO[pi] comments (they're no longer needed):\n\n${removeList}`,
				);
			}

			const message = `Please handle the following TODO[pi] items. Please ask me any clarifying questions you have before continuing.\n\n${parts.join("\n\n")}`;
			pi.sendUserMessage(message);
		},
	});
}
