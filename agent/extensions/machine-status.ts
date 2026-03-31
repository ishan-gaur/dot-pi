import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { hostname } from "node:os";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("machine", theme.fg("dim", `⌂ ${hostname()}`));
	});
}
