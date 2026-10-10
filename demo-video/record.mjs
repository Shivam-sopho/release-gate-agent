#!/usr/bin/env node
// Records a real end-to-end run for the demo video: drives the control panel in a
// headless browser (upload APKs -> run -> human Allow -> report) while the emulator
// screen is recorded with adb screenrecord. Writes out/panel.webm, out/emulator.mp4
// and out/timeline.json (event times in seconds from the start of the panel recording).
//
// Prereqs: tools server on :8791, control panel on :8792, one emulator running.

import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(import.meta.dirname, "out");
const ADB = path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb");
const PANEL = process.env.PANEL_URL || "http://127.0.0.1:8792";
const SCENARIO = process.env.SCENARIO || "auth-logout";
const PACKAGE = process.env.PACKAGE || "com.example.releasedemo";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Start from a clean device so the video shows the whole journey.
try {
  execFileSync(ADB, ["uninstall", PACKAGE], { stdio: "ignore" });
} catch {}
execFileSync(ADB, ["shell", "input", "keyevent", "KEYCODE_HOME"]);

const browser = await chromium.launch();
// Full-HD viewport, zoomed so the panel fills the frame with readable text.
const VIEW = { width: 1920, height: 1080 };
const ZOOM = 1.45;
const zoom = () => page.addStyleTag({ content: `html { zoom: ${ZOOM}; }` });
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: VIEW },
  colorScheme: "dark",
});
const page = await context.newPage();
const t0 = Date.now();
const timeline = {};
const mark = (name) => {
  timeline[name] = (Date.now() - t0) / 1000;
  console.log(`[${timeline[name].toFixed(1)}s] ${name}`);
};

// One adb screenrecord segment that ends on its own time limit: interrupting it
// leaves the mp4 without its index (moov atom), which makes it unreadable.
const EMU_SECONDS = Number(process.env.EMU_SECONDS || 175);
let segments = [];
async function recordEmulator() {
  const remote = "/sdcard/demo_0.mp4";
  const start = (Date.now() - t0) / 1000;
  await new Promise((resolve) => {
    const p = spawn(ADB, ["shell", "screenrecord", "--size", "540x1200", "--bit-rate", "6000000", "--time-limit", String(EMU_SECONDS), remote]);
    p.on("exit", resolve);
  });
  await new Promise((r) => setTimeout(r, 1500)); // let the file finalize
  const local = path.join(OUT, "emulator_0.mp4");
  execFileSync(ADB, ["pull", remote, local], { stdio: "ignore" });
  segments.push({ file: local, start });
}

await page.goto(PANEL);
await zoom();
await page.waitForTimeout(1500);
mark("panel_loaded");
const emulatorDone = recordEmulator();

await page.setInputFiles("#fileOld", path.join(ROOT, "scenarios", SCENARIO, "old.apk"));
await page.waitForTimeout(700);
await page.setInputFiles("#fileNew", path.join(ROOT, "scenarios", SCENARIO, "new.apk"));
await page.waitForTimeout(1200);
mark("apks_selected");
await page.click("#runBtn");
mark("run_clicked");

// Keep the newest log entry in view, like a person watching the run.
const follow = setInterval(() => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {}), 700);

await page.waitForSelector("text=Detected package", { timeout: 60_000 }).catch(() => {});
await page.waitForSelector(".tool-name", { timeout: 120_000 });
mark("first_tool_call");
await page.waitForSelector("button.allow", { timeout: 600_000 });
mark("approval_shown");
clearInterval(follow);
await page.locator("button.allow").scrollIntoViewIfNeeded();
await page.waitForTimeout(4000); // let the viewer read the verdict
await page.locator("button.allow").hover();
await page.waitForTimeout(800);
await page.click("button.allow");
mark("allow_clicked");
await page.waitForFunction(() => document.getElementById("reportLinks").style.display === "flex", null, { timeout: 300_000 });
mark("run_done");
await page.waitForTimeout(2000);

// Open the rendered report and scroll through it.
await page.goto(`${PANEL}/report`);
await zoom();
await page.waitForTimeout(2000);
mark("report_opened");
const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < height * ZOOM; y += 8) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(16);
}
await page.waitForTimeout(1500);
mark("report_end");

const video = page.video();
await context.close();
await browser.close();
fs.renameSync(await video.path(), path.join(OUT, "panel.webm"));
await emulatorDone;
timeline.emulator_segments = segments.map((s) => ({ file: path.basename(s.file), start: s.start }));
fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(timeline, null, 2));
console.log(JSON.stringify(timeline, null, 2));
