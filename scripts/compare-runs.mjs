#!/usr/bin/env node
// Builds the before/after table from runs/*/summary.json, grouped by prompt
// version and scenario. Only completed runs that reached the release gate count.
//
//   node scripts/compare-runs.mjs [--since 2026-10-10T09:30]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUNS = path.join(ROOT, "runs");
const { values: args } = parseArgs({ options: { since: { type: "string" } } });

const runs = fs
  .readdirSync(RUNS)
  .map((d) => path.join(RUNS, d, "summary.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
  .filter((r) => r.result?.subtype === "success" && r.verdict)
  .filter((r) => !args.since || r.started_at >= args.since)
  .filter((r) => !r.fault_inject);

const groups = new Map();
for (const r of runs) {
  const key = `${r.prompt_version}|${r.scenario}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (x, d = 0) => x.toFixed(d);

console.log("| Prompt | Scenario | Runs | Verdicts | Turns (avg) | Tool calls (avg) | Time s (avg) | Cost $ (avg) | Cached input tokens (avg) | Output tokens (avg) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [key, rs] of [...groups].sort()) {
  const [prompt, scenario] = key.split("|");
  const verdicts = Object.entries(
    rs.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] || 0) + 1 }), {})
  )
    .map(([v, n]) => `${v}×${n}`)
    .join(", ");
  console.log(
    `| ${prompt} | ${scenario} | ${rs.length} | ${verdicts} | ${fmt(mean(rs.map((r) => r.result.num_turns)), 1)} | ${fmt(mean(rs.map((r) => r.tool_calls)), 1)} | ${fmt(mean(rs.map((r) => r.result.duration_ms / 1000)), 1)} | ${fmt(mean(rs.map((r) => r.result.total_cost_usd)), 3)} | ${fmt(mean(rs.map((r) => r.result.usage.cache_read_input_tokens)))} | ${fmt(mean(rs.map((r) => r.result.usage.output_tokens)))} |`
  );
}
console.log(`\n${runs.length} runs: ${runs.map((r) => r.run_id).join(", ")}`);
