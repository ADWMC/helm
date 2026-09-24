import * as bundledPiAgentCore from "@adwmc/helm-agent-core";
import * as bundledPiAiCompat from "@adwmc/helm-ai/compat";
import * as bundledPiAiOauth from "@adwmc/helm-ai/oauth";
import * as bundledPiAiProviders from "@adwmc/helm-ai/providers/all";
import * as bundledPiTui from "@adwmc/helm-tui";
import * as bundledTypebox from "typebox";
import * as bundledTypeboxCompile from "typebox/compile";
import * as bundledTypeboxValue from "typebox/value";
// This import is safe because loader.ts exports are not re-exported from index.ts.
// Extensions can therefore import from @adwmc/helm-coding-agent.
import * as bundledPiCodingAgent from "../../index.ts";

/** Modules available to extensions in source and compiled binary runtimes. */
export const VIRTUAL_MODULES: Record<string, unknown> = {
	typebox: bundledTypebox,
	"typebox/compile": bundledTypeboxCompile,
	"typebox/value": bundledTypeboxValue,
	"@sinclair/typebox": bundledTypebox,
	"@sinclair/typebox/compile": bundledTypeboxCompile,
	"@sinclair/typebox/value": bundledTypeboxValue,
	"@adwmc/helm-agent-core": bundledPiAgentCore,
	"@adwmc/helm-tui": bundledPiTui,
	// Extensions resolve the pi-ai root to the compat entrypoint (a strict
	// superset of the core entrypoint): existing extensions using the old
	// global API keep working at runtime until compat is removed.
	"@adwmc/helm-ai": bundledPiAiCompat,
	"@adwmc/helm-ai/compat": bundledPiAiCompat,
	"@adwmc/helm-ai/oauth": bundledPiAiOauth,
	"@adwmc/helm-ai/providers/all": bundledPiAiProviders,
	"@adwmc/helm-coding-agent": bundledPiCodingAgent,
	"@mariozechner/pi-agent-core": bundledPiAgentCore,
	"@mariozechner/pi-tui": bundledPiTui,
	"@mariozechner/pi-ai": bundledPiAiCompat,
	"@mariozechner/pi-ai/compat": bundledPiAiCompat,
	"@mariozechner/pi-ai/oauth": bundledPiAiOauth,
	"@mariozechner/pi-ai/providers/all": bundledPiAiProviders,
	"@mariozechner/pi-coding-agent": bundledPiCodingAgent,
};
