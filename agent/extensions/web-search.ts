/**
 * Web search via Gemini CLI's built-in web tools.
 *
 * Shells out to `gemini -p "..."`.
 *
 * Provides:
 *   - `web_search` tool (agent-callable)
 *   - `/search` command (user-callable, results injected as context)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync, spawn } from "node:child_process";

const TIMEOUT_MS = 120_000; // 2 minutes max per search

function geminiSearch(query: string, signal?: AbortSignal): Promise<string> {
	const prompt = [
		`Search the web for: ${query}`,
		"",
		"Use web search/fetch tools to ground your answer in current sources.",
		"Return results with titles, URLs, and brief descriptions.",
		"Include source citations.",
	].join("\n");

	return new Promise((resolve, reject) => {
		const proc = spawn("gemini", ["-p", prompt], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let done = false;

		const timer = setTimeout(() => {
			if (!done) {
				proc.kill("SIGTERM");
				reject(new Error(`Search timed out after ${TIMEOUT_MS / 1000}s`));
			}
		}, TIMEOUT_MS);

		if (signal) {
			const onAbort = () => {
				if (!done) {
					proc.kill("SIGTERM");
					reject(new Error("Search cancelled"));
				}
			};
			if (signal.aborted) {
				proc.kill("SIGTERM");
				reject(new Error("Search cancelled"));
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			done = true;
			clearTimeout(timer);
			if (code !== 0) {
				reject(new Error(`gemini CLI exited with code ${code}: ${stderr || stdout}`));
			} else {
				resolve(stdout.trim());
			}
		});

		proc.on("error", (err) => {
			done = true;
			clearTimeout(timer);
			reject(new Error(`Failed to spawn gemini CLI: ${err.message}`));
		});
	});
}

function hasGemini(): boolean {
	try {
		execSync("which gemini", { stdio: ["pipe", "pipe", "pipe"] });
		return true;
	} catch {
		return false;
	}
}

const INSTALL_HELP = [
	"gemini CLI not found.",
	"Install it: npm install -g @google/gemini-cli",
	"Then run `gemini` once to authenticate.",
	"Web tools docs: https://geminicli.com/docs/cli/tutorials/web-tools/",
].join("\n");

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using Gemini CLI's built-in web tools. Returns results with titles, URLs, and descriptions. Use for finding documentation, recent information, facts, or any web content.",
		promptGuidelines: [
			"Use web_search when you need current information, documentation, or facts not in your training data.",
			"Web search takes 15-60 seconds — tell the user you're searching before calling it.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, _ctx) {
			if (!hasGemini()) {
				throw new Error(INSTALL_HELP);
			}

			onUpdate?.({
				content: [{ type: "text", text: `Searching: ${params.query}...` }],
			});

			const result = await geminiSearch(params.query, signal);

			return {
				content: [{ type: "text", text: result }],
				details: { query: params.query },
			};
		},
	});

	pi.registerCommand("search", {
		description: "Search the web and inject results as context",
		handler: async (args, ctx) => {
			const query = args?.trim();
			if (!query) {
				ctx.ui.notify("Usage: /search <query>", "warning");
				return;
			}

			if (!hasGemini()) {
				ctx.ui.notify("gemini CLI not found. Install: npm install -g @google/gemini-cli", "error");
				return;
			}

			ctx.ui.notify(`Searching: ${query}...`, "info");

			try {
				const result = await geminiSearch(query);
				pi.sendMessage({
					customType: "web-search",
					content: `## Web Search: ${query}\n\n${result}`,
					display: true,
				});
			} catch (e: any) {
				ctx.ui.notify(`Search failed: ${e.message}`, "error");
			}
		},
	});
}
