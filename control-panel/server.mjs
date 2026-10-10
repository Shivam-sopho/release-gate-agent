import express from "express";
import multer from "multer";
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const PORT = process.env.PORT || 8792;
const ROOT = path.resolve(import.meta.dirname, "..");
const AGENT_DIR = path.join(ROOT, "agent");
const RUNS_DIR = path.join(ROOT, "runs");
const UPLOADS_DIR = path.join(import.meta.dirname, ".uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR });

function sdkHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library/Android/sdk"),
    path.join(os.homedir(), "Android/Sdk"),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function findAapt() {
  const home = sdkHome();
  if (!home) return null;
  const buildTools = path.join(home, "build-tools");
  if (!fs.existsSync(buildTools)) return null;
  const versions = fs.readdirSync(buildTools).sort().reverse();
  for (const v of versions) {
    const p = path.join(buildTools, v, "aapt");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Not hardcoded to the demo app: read the real applicationId out of whatever
// APK was actually uploaded, so the pipeline works on any app given to it.
function detectPackageId(apkPath) {
  const aapt = findAapt();
  if (!aapt) return null;
  try {
    const out = execFileSync(aapt, ["dump", "badging", apkPath], { encoding: "utf8" });
    const m = out.match(/package: name='([^']+)'/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, "public")));

// ---------------------------------------------------------------------------
// Runs: /api/run spawns agent/run.mjs with CONTROL_PANEL_URL pointing back here.
// The agent posts its events to /api/live/event, they fan out to the browser over
// SSE, and the browser's Allow/Deny lands in /api/live/decide, which the agent's
// release gate polls.
// ---------------------------------------------------------------------------
let currentPackageId = null;
let currentRunDir = null;
let agentProcess = null;
let liveClients = [];

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of liveClients) c.write(payload);
}

app.post("/api/upload", upload.fields([{ name: "old_apk" }, { name: "new_apk" }]), async (req, res) => {
  try {
    const oldFile = req.files?.old_apk?.[0];
    const newFile = req.files?.new_apk?.[0];
    if (!oldFile || !newFile) return res.status(400).json({ error: "old_apk and new_apk are both required" });

    const oldDest = path.join(UPLOADS_DIR, "old.apk");
    const newDest = path.join(UPLOADS_DIR, "new.apk");
    fs.renameSync(oldFile.path, oldDest);
    fs.renameSync(newFile.path, newDest);

    currentPackageId = detectPackageId(newDest) || detectPackageId(oldDest);
    res.json({ ok: true, old_apk: oldDest, new_apk: newDest, package_id: currentPackageId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/live/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  liveClients.push(res);
  req.on("close", () => {
    liveClients = liveClients.filter((c) => c !== res);
  });
});

app.post("/api/live/event", (req, res) => {
  if (req.body.type === "run.started") currentRunDir = req.body.run_dir;
  broadcast(req.body);
  res.json({ ok: true, clients: liveClients.length });
});

let pendingDecision = null;

app.post("/api/live/decide", (req, res) => {
  pendingDecision = req.body;
  res.json({ ok: true });
});

app.get("/api/live/decision", (req, res) => {
  const decision = pendingDecision;
  pendingDecision = null;
  res.json({ decision });
});

app.post("/api/run", (req, res) => {
  if (agentProcess) return res.status(409).json({ error: "a run is already in progress" });
  const args = [
    "--env-file-if-exists=../.env",
    "run.mjs",
    "--old", path.join(UPLOADS_DIR, "old.apk"),
    "--new", path.join(UPLOADS_DIR, "new.apk"),
    "--prompt", req.body?.prompt || process.env.AGENT_PROMPT || "v2-evidence-first",
  ];
  if (currentPackageId) args.push("--package", currentPackageId);
  pendingDecision = null;
  agentProcess = spawn(process.execPath, args, {
    cwd: AGENT_DIR,
    env: { ...process.env, CONTROL_PANEL_URL: `http://127.0.0.1:${PORT}` },
    stdio: ["ignore", "inherit", "inherit"],
  });
  agentProcess.on("exit", (code) => {
    agentProcess = null;
    if (code) broadcast({ type: "turn.done", state: { status: "failed" } });
  });
  res.json({ ok: true });
});

function latestRunDir() {
  if (currentRunDir && fs.existsSync(currentRunDir)) return currentRunDir;
  if (!fs.existsSync(RUNS_DIR)) return null;
  const dirs = fs.readdirSync(RUNS_DIR).sort().reverse();
  return dirs.length ? path.join(RUNS_DIR, dirs[0]) : null;
}

app.use("/evidence", (req, res, next) => {
  const dir = latestRunDir();
  if (!dir) return res.status(404).send("No runs yet.");
  express.static(dir)(req, res, next);
});

app.get("/report", (req, res) => {
  const reportPath = path.join(latestRunDir() || "", "REPORT.md");
  if (!fs.existsSync(reportPath)) return res.status(404).send("No report yet — run the agent first.");
  const md = fs.readFileSync(reportPath, "utf8");
  const html = marked.parse(md, { gfm: true });
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Release Regression Report</title>
<base href="/evidence/">
<style>
  :root { color-scheme: dark; }
  body { background:#0b0d10; color:#e6e9ee; font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; line-height: 1.6; }
  h1,h2,h3 { border-bottom: 1px solid #232a33; padding-bottom: 8px; }
  code { background:#12161b; padding: 2px 6px; border-radius: 4px; }
  pre { background:#12161b; padding: 14px; border-radius: 8px; overflow-x: auto; border: 1px solid #232a33; }
  pre code { background: none; padding: 0; }
  img { max-width: 100%; border-radius: 6px; border: 1px solid #232a33; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #232a33; padding: 8px 12px; text-align: left; }
  a { color: #4f8cff; }
  details summary { cursor: pointer; color: #8b95a3; }
  .topbar { display:flex; justify-content: flex-end; margin-bottom: 16px; }
  .topbar a { background:#4f8cff; color:white; text-decoration:none; padding:8px 16px; border-radius:6px; font-weight:600; }
</style></head>
<body>
<div class="topbar"><a href="/evidence/REPORT.md" download="release-regression-report.md">⬇ Download report (.md)</a></div>
${html}
</body></html>`);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Release agent control panel: http://127.0.0.1:${PORT}`);
});
