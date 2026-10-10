// Renders the header label bars used over the live-run footage (transparent PNGs, 1920x110).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const labels = {
  liveA: ["LIVE RUN", "Upload the shipped build and the release candidate"],
  liveB: ["LIVE RUN · 4× SPEED", "Real emulator: log in → upgrade → relaunch → fresh-install control"],
  liveC: ["HUMAN GATE", "Verdict with evidence. Nothing ships until a person clicks Allow"],
  liveD: ["REPORT", "Results table, screenshots, root cause, suggested fix in code"],
  shotNeatlogs: ["NEATLOGS · REAL TRACES", "Same app, same verdict. v1: 66 steps · 95 s  →  v2: 45 steps · 77 s"],
  shotRecovery: ["NEATLOGS · FAILURE RECOVERY", "Failed install, launch and tap in red. Then wait for device, retry, ok"],
  shotLive: ["NEATLOGS · LIVE DASHBOARD", "v1 trace → failure-recovery trace (errors in red, then retries) → v2 output"],
  shotTrail: ["ENTIRE · TRAIL #1", "The agent's verdict posted on the Trail, next to the runner review"],
};
const dir = path.join(import.meta.dirname, "labels");
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 110 } });
for (const [id, [kicker, text]] of Object.entries(labels)) {
  await page.setContent(`<body style="margin:0;background:transparent;font-family:-apple-system,'SF Pro Display',sans-serif">
    <div style="height:110px;display:flex;align-items:center;gap:26px;padding:0 150px;background:linear-gradient(#0b0d12,#0b0d12ee)">
      <span style="font:600 24px 'SF Mono',Menlo,monospace;letter-spacing:.08em;color:#7c6cff;border:1px solid #7c6cff;border-radius:999px;padding:8px 18px">${kicker}</span>
      <span style="font-size:34px;font-weight:650;color:#eef1f6;letter-spacing:-.01em">${text}</span></div></body>`);
  await page.screenshot({ path: path.join(dir, `${id}.png`), omitBackground: true });
}
await browser.close();
