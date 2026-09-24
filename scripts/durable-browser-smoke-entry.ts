import * as durable from "@adwmc/helm-durable";
import * as environment from "@adwmc/helm-durable/env";
import * as jsonl from "@adwmc/helm-durable/storage/jsonl";
import * as sqlite from "@adwmc/helm-durable/storage/sqlite";

// Keep runtime-neutral public entry points live so the browser smoke build
// catches accidental imports of Node-only adapters or built-ins.
console.log(Object.keys(durable), Object.keys(environment), Object.keys(jsonl), Object.keys(sqlite));
