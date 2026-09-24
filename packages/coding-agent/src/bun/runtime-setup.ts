import { bedrockProviderModule } from "@adwmc/helm-ai/bedrock-provider";
import { registerBunOAuthFlows } from "@adwmc/helm-ai/bun-oauth";
import { setBedrockProviderModule } from "@adwmc/helm-ai/compat";
import { APP_NAME } from "../config.ts";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;
registerBunOAuthFlows();
setBedrockProviderModule(bedrockProviderModule);
