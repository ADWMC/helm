import assert from "node:assert/strict";
import { test } from "node:test";
import { CORE_TOOLS, GATED_TOOLS, selectToolSurface } from "./tool-surface.ts";

test("mode faces equal core when no gated tools (HCOT removed per §0)", () => {
	const lite = selectToolSurface({ mode: "lite" });
	assert.equal(lite.has("hcot_attack"), false);
	assert.equal(lite.has("hcot_stats"), false);
	assert.equal(lite.has("helmpi_status"), true);
	assert.equal(lite.has("helmpi_validate_scope"), true);

	const full = selectToolSurface({ mode: "full" });
	assert.equal(full.has("hcot_attack"), false);
	assert.equal(full.has("hcot_stats"), false);
	// With no gated tools, every mode face is exactly the core.
	assert.equal(lite.size, CORE_TOOLS.length);
	assert.equal(full.size, CORE_TOOLS.length);
});

test("hcot tools never surface in any mode (§0 negative)", () => {
	for (const mode of ["lite", "full", "deep"] as const) {
		const face = selectToolSurface({ mode });
		assert.equal(face.has("hcot_attack"), false, `${mode} must not expose hcot_attack`);
		assert.equal(face.has("hcot_stats"), false, `${mode} must not expose hcot_stats`);
	}
});

test("domain filter keeps core tools on every route domain", () => {
	for (const domain of ["web", "breach", null]) {
		const face = selectToolSurface({ mode: "full", domain });
		for (const t of CORE_TOOLS) assert.ok(face.has(t), `${t} must stay in ${domain} face`);
	}
});

test("every gated tool declares valid modes", () => {
	for (const [name, gate] of Object.entries(GATED_TOOLS)) {
		assert.ok(gate.modes.length > 0, `${name} needs modes`);
		assert.ok(gate.modes.every((m) => ["lite", "full", "deep"].includes(m)));
	}
});
