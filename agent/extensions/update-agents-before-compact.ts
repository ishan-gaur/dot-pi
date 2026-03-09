/**
 * Update AGENTS.md Before Compaction
 *
 * When compaction triggers (manual `/compact` or auto), prompts the user
 * to let the agent update AGENTS.md with session knowledge before context
 * is lost. Flow:
 *
 *   1. session_before_compact fires → confirm dialog (10s timeout)
 *   2. If yes: cancel compaction, send followUp message to update AGENTS.md
 *   3. agent_end fires → trigger compaction for real
 *   4. session_before_compact fires again → flag is set, let it proceed
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let pendingCompact = false;
	let savedCustomInstructions: string | undefined;

	pi.on("session_before_compact", async (event, ctx) => {
		// Second pass — let compaction proceed
		if (pendingCompact) {
			return;
		}

		const shouldUpdate = await ctx.ui.confirm(
			"Update AGENTS.md?",
			"Have the agent update AGENTS.md with session knowledge before compacting?",
			{ timeout: 10000 },
		);

		if (!shouldUpdate) {
			return; // Proceed with normal compaction
		}

		// Cancel compaction, ask agent to update AGENTS.md first
		pendingCompact = true;
		savedCustomInstructions = event.customInstructions;

		pi.sendUserMessage(
			"Before this session is compacted, review our conversation and update the project's AGENTS.md (and the global ~/.pi/agent/AGENTS.md if relevant) with any new working knowledge, gotchas, or key decisions discovered. Keep notes concise and useful for future sessions. Do NOT run /compact yourself — it will happen automatically after you finish.",
			{ deliverAs: "followUp" },
		);

		return { cancel: true };
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!pendingCompact) return;
		pendingCompact = false;

		ctx.compact({
			customInstructions: savedCustomInstructions,
			onComplete: () => {
				savedCustomInstructions = undefined;
				ctx.ui.notify("AGENTS.md updated & compaction complete ✓", "info");
			},
			onError: (error) => {
				savedCustomInstructions = undefined;
				ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
			},
		});
	});
}
