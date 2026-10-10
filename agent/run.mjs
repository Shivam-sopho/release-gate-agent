#!/usr/bin/env node
// Autonomous release-check run: one Claude Agent SDK query() that diffs two APKs,
// drives the emulator through the MCP tool server, writes a report, and blocks on
// a human approval gate. Runs on the local Claude Code login (no API key).
//
// Usage:
//   node --env-file-if-exists=../.env run.mjs --scenario auth-logout [--prompt v1-baseline]
//   node --env-file-if-exists=../.env run.mjs --old path/old.apk --new path/new.apk
//
// Every run is traced to neatlogs (when NEATLOGS_API_KEY is set) and summarised
// to runs/<run-id>.json so runs can be compared before/after a change.

import * as claudeAgentSDK from "@anthropic-ai/claude-agent-sdk";
import { init, identify, flush, shutdown } from "neatlogs";
import { wrapClaudeAgentSDK } from "neatlogs/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");

const { values: args } = parseArgs({
  options: {
    scenario: { type: "string" },
    old: { type: "string" },
    new: { type: "string" },
    package: { type: "string" },
    prompt: { type: "string", default: process.env.AGENT_PROMPT || "v1-baseline" },
    model: { type: "string", default: process.env.AGENT_MODEL },
    "max-turns": { type: "string", default: "120" },
    // auto-approve / auto-deny the release gate (for unattended benchmark runs only)
    gate: { type: "string", default: "human" },
  },
});

const MCP_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:8791/mcp";
const PANEL_URL = process.env.CONTROL_PANEL_URL || ""; // e.g. http://127.0.0.1:8792
const GATE_TOOL = "mcp__tools__request_release_approval";

const oldApk = path.resolve(args.old || path.join(ROOT, "scenarios", args.scenario ?? "", "old.apk"));
const newApk = path.resolve(args.new || path.join(ROOT, "scenarios", args.scenario ?? "", "new.apk"));
if (!fs.existsSync(oldApk) || !fs.existsSync(newApk)) {
  console.error(`APKs not found:\n  ${oldApk}\n  ${newApk}\nPass --scenario <name> or --old/--new.`);
  process.exit(2);
}
const scenario = args.scenario || path.basename(path.dirname(newApk));
// Prompt "v1-*" runs against the original v1 toolset so baseline runs stay reproducible.
const toolset = args.prompt.startsWith("v1") ? "v1" : "v2";
const promptFile = path.join(ROOT, "prompts", `${args.prompt}.md`);
const systemPrompt = fs.readFileSync(promptFile, "utf8");

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${scenario}_${args.prompt}`;
const runDir = path.join(ROOT, "runs", runId);
fs.mkdirSync(runDir, { recursive: true });

const userMessage =
  `A new Android release is ready to ship. Analyze it end to end and give a release-readiness verdict.\n\n` +
  `old.apk (currently shipped): ${oldApk}\n` +
  `new.apk (release candidate): ${newApk}\n` +
  (args.package
    ? `Both builds are package ${args.package}.\n`
    : `Both builds are the same app; read the package id from the diff/manifest.\n`) +
  `Finish with request_release_approval.`;

// ---------------------------------------------------------------------------
// Control panel bridge (optional): mirror the run into the browser UI.
// ---------------------------------------------------------------------------
async function emit(event) {
  if (!PANEL_URL) return;
  try {
    await fetch(`${PANEL_URL}/api/live/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // The panel is a viewer; a run never fails because nobody is watching.
  }
}

const shortName = (name) => name.replace(/^mcp__tools__/, "");

// ---------------------------------------------------------------------------
// Human approval gate. The SDK calls canUseTool before the gate tool runs; the
// run cannot conclude until a human answers.
// ---------------------------------------------------------------------------
async function waitForPanelDecision(toolUseID, signal) {
  for (;;) {
    if (signal.aborted) return { status: "deny", reason: "aborted" };
    try {
      const r = await fetch(`${PANEL_URL}/api/live/decision`);
      const { decision } = await r.json();
      if (decision) return decision;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function askOnTerminal(input) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n=== RELEASE GATE ===\nverdict: ${input.verdict}\n${input.summary}\n`);
  const answer = (await rl.question("Ship this release? [y/N] ")).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes" ? { status: "allow" } : { status: "deny", reason: "Denied by reviewer" };
}

let gateDecision = null;

async function canUseTool(toolName, input, { signal, toolUseID }) {
  if (toolName !== GATE_TOOL) {
    if (toolName.startsWith("mcp__tools__")) return { behavior: "allow", updatedInput: input };
    return { behavior: "deny", message: `${toolName} is not available to this agent.` };
  }
  let decision;
  if (args.gate === "auto-allow") decision = { status: "allow" };
  else if (args.gate === "auto-deny") decision = { status: "deny", reason: "auto-deny (benchmark run)" };
  else if (PANEL_URL) {
    await emit({ type: "tool.approval_required", tool_calls: [{ id: toolUseID }] });
    decision = await waitForPanelDecision(toolUseID, signal);
  } else {
    decision = await askOnTerminal(input);
  }
  gateDecision = { ...decision, verdict: input.verdict };
  if (decision.status === "allow") return { behavior: "allow", updatedInput: input };
  return { behavior: "deny", message: `Release blocked by human reviewer: ${decision.reason || "denied"}. Stop now.` };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const tracing = Boolean(process.env.NEATLOGS_API_KEY);
if (tracing) {
  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    workflowName: "apk-release-check",
    tags: [`prompt:${args.prompt}`, `toolset:${toolset}`, `scenario:${scenario}`],
    metadata: { run_id: runId, prompt_version: args.prompt, toolset, scenario },
  });
} else {
  console.warn("NEATLOGS_API_KEY not set: running without tracing.");
}
const { query } = tracing ? wrapClaudeAgentSDK(claudeAgentSDK) : claudeAgentSDK;

const summary = {
  run_id: runId,
  scenario,
  prompt_version: args.prompt,
  toolset,
  git_commit: gitCommit(),
  fault_inject: process.env.FAULT_INJECT_NOTE || null,
  model: args.model || "(default)",
  started_at: new Date().toISOString(),
  tool_calls: 0,
  tool_errors: 0,
  tool_counts: {},
  verdict: null,
  gate: null,
  result: null,
};

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const transcript = fs.createWriteStream(path.join(runDir, "transcript.jsonl"));

async function main() {
  await emit({ type: "run.started", run_id: runId, run_dir: runDir, prompt_version: args.prompt });
  const stream = query({
    prompt: userMessage,
    options: {
      systemPrompt,
      model: args.model,
      maxTurns: Number(args["max-turns"]),
      tools: [], // no built-in Claude Code tools: only the release-agent MCP tools
      // The tool server writes this run's screenshots/logcat/report into runDir.
      mcpServers: { tools: { type: "http", url: MCP_URL, headers: { "x-evidence-dir": runDir, "x-toolset": toolset } } },
      strictMcpConfig: true,
      settingSources: [],
      canUseTool,
      cwd: runDir,
    },
  });

  for await (const msg of stream) {
    transcript.write(JSON.stringify(msg) + "\n");

    if (msg.type === "assistant") {
      const blocks = msg.message?.content ?? [];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const toolUses = blocks.filter((b) => b.type === "tool_use");
      for (const t of toolUses) {
        const name = shortName(t.name);
        summary.tool_calls++;
        summary.tool_counts[name] = (summary.tool_counts[name] || 0) + 1;
        if (name === "request_release_approval") summary.verdict = t.input?.verdict ?? null;
        console.log(`→ ${name}(${JSON.stringify(t.input).slice(0, 160)})`);
      }
      if (text) console.log(`\n${text}\n`);
      await emit({
        type: "model.message",
        content: text || null,
        tool_calls: toolUses.map((t) => ({
          id: t.id,
          function: { name: shortName(t.name), arguments: JSON.stringify(t.input ?? {}) },
        })),
      });
    } else if (msg.type === "user") {
      const blocks = Array.isArray(msg.message?.content) ? msg.message.content : [];
      for (const b of blocks.filter((b) => b.type === "tool_result")) {
        const content = Array.isArray(b.content)
          ? b.content.map((c) => c.text ?? "").join("\n")
          : String(b.content ?? "");
        // A human denying the release gate is a decision, not a tool failure.
        if (b.is_error && !content.startsWith("Release blocked by human reviewer")) {
          summary.tool_errors++;
          console.log(`  ✗ tool error: ${content.slice(0, 200)}`);
        }
        await emit({ type: "tool.response", content, is_error: Boolean(b.is_error) });
      }
    } else if (msg.type === "result") {
      summary.result = {
        subtype: msg.subtype,
        num_turns: msg.num_turns,
        duration_ms: msg.duration_ms,
        duration_api_ms: msg.duration_api_ms,
        total_cost_usd: msg.total_cost_usd,
        usage: msg.usage,
      };
    }
  }
}

let exitCode = 0;
try {
  await identify({ endUserId: process.env.RELEASE_ENGINEER || "release-engineer" }, main);
} catch (e) {
  exitCode = 1;
  summary.error = String(e?.stack || e);
  console.error(e);
} finally {
  summary.gate = gateDecision;
  summary.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  transcript.end();
  await emit({ type: "turn.done", state: { status: exitCode ? "failed" : "done" } });
  if (tracing) {
    await flush();
    await shutdown();
  }
  console.log(`\nrun summary: ${path.relative(ROOT, path.join(runDir, "summary.json"))}`);
  console.log(JSON.stringify({ verdict: summary.verdict, gate: summary.gate?.status, ...summary.result }, null, 2));
}
process.exit(exitCode);
