import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { execFileSync, execSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = process.env.PORT || 8791;
const DEFAULT_EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.resolve("./evidence");

// Each agent run sends its own evidence directory in the x-evidence-dir header,
// so concurrent or back-to-back runs never overwrite each other's screenshots.
const requestContext = new AsyncLocalStorage();
function evidenceDir() {
  const dir = requestContext.getStore()?.evidenceDir || DEFAULT_EVIDENCE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Android Studio on macOS installs the SDK to ~/Library/Android/sdk; Linux uses ~/Android/Sdk.
function sdkHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library/Android/sdk"),
    path.join(os.homedir(), "Android/Sdk"),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function adbPath() {
  const home = sdkHome();
  const bundled = home && path.join(home, "platform-tools", "adb");
  return bundled && fs.existsSync(bundled) ? bundled : "adb";
}

function adb(args, opts = {}) {
  return execFileSync(adbPath(), args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50, ...opts });
}

function text(s) {
  return { content: [{ type: "text", text: s }] };
}

function errorText(s) {
  return { content: [{ type: "text", text: s }], isError: true };
}

// Opt-in fault injection for reproducible failure-recovery runs, e.g.
// FAULT_INJECT="adb_install:1,adb_dump_ui:1" makes the first adb_install call and
// the first adb_dump_ui call fail the way a flaky emulator does. Off by default;
// every injected fault is logged on the server so runs can be audited.
const faultBudget = Object.fromEntries(
  (process.env.FAULT_INJECT || "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.split(":"))
    .map(([tool, n]) => [tool, Number(n || 1)])
);
const INJECTED_ERRORS = {
  adb_install: "adb: failed to install: error: device offline",
  adb_dump_ui: "ERROR: could not get idle state.",
  adb_tap: "error: closed",
  adb_launch: "error: device offline",
};

// Wraps a tool handler so adb/aapt failures come back to the agent as a tool
// error it can reason about and recover from, instead of an opaque exception.
function tool(name, handler) {
  return async (input) => {
    if (faultBudget[name] > 0) {
      faultBudget[name]--;
      console.log(`[fault-inject] ${name} -> ${INJECTED_ERRORS[name] || "error: device offline"}`);
      return errorText(INJECTED_ERRORS[name] || "error: device offline");
    }
    try {
      return await handler(input);
    } catch (e) {
      const detail = [e.stderr, e.stdout, e.message].filter(Boolean).map(String).join("\n").trim();
      return errorText(`${name} failed: ${detail.slice(0, 2000)}`);
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resumedActivity() {
  const out = adb(["shell", "dumpsys", "activity", "activities"]);
  const m = out.match(/topResumedActivity=ActivityRecord\{\S+ \S+ (\S+)/) || out.match(/ResumedActivity: ActivityRecord\{\S+ \S+ (\S+)/);
  return m ? m[1] : null;
}

async function waitForResumed(packageId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (resumedActivity()?.startsWith(`${packageId}/`)) return true;
    await sleep(250);
  }
  return false;
}

// Compact screen state: resumed activity plus the elements an agent can act on,
// with a precomputed tap centre. Drops system chrome (status/navigation bars,
// the root content frame) that v1 traces showed the agent never used.
const CHROME_IDS = new Set(["android:id/content", "android:id/statusBarBackground", "android:id/navigationBarBackground"]);
function screenState() {
  // Dump first: uiautomator waits for the UI to go idle, so trampoline activities
  // (e.g. a splash that redirects) have settled before we read which one is resumed.
  adb(["shell", "uiautomator", "dump", "/sdcard/dump.xml"]);
  const activity = resumedActivity() || "(none)";
  const xml = adb(["shell", "cat", "/sdcard/dump.xml"]);
  const elements = [...xml.matchAll(/text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
    .filter((m) => (m[1] || m[2]) && !CHROME_IDS.has(m[2]))
    .map((m) => {
      const [x1, y1, x2, y2] = m.slice(3, 7).map(Number);
      return `text="${m[1]}" id="${m[2].replace(/^[\w.]+:id\//, "")}" tap=(${(x1 + x2) >> 1},${(y1 + y2) >> 1})`;
    });
  return [`resumed_activity: ${activity}`, "elements:", ...elements].join("\n");
}

// toolset "v1" reproduces the original tools exactly (baseline runs); "v2" is the
// version improved after reading the v1 neatlogs traces (see hackathon.md).
function buildServer(toolset, sourceDir) {
  const v2 = toolset !== "v1";
  const server = new McpServer({ name: "release-gate-tools", version: "1.0.0" });

  server.registerTool(
    "diff_apks",
    {
      description:
        "Diff two compiled APKs (old vs new) at the binary level: AndroidManifest.xml (permissions, activities, services, receivers), and dex string-pool / size deltas per class file. This is a real diff of the shipped artifact, not the source/git diff. Use this FIRST to understand what actually changed before deciding what to test.",
      inputSchema: { old_apk: z.string().describe("Path to old.apk"), new_apk: z.string().describe("Path to new.apk") },
    },
    tool("diff_apks", async ({ old_apk, new_apk }) => {
      const tmp = fs.mkdtempSync("/tmp/apkdiff-");
      const oldDir = path.join(tmp, "old");
      const newDir = path.join(tmp, "new");
      fs.mkdirSync(oldDir);
      fs.mkdirSync(newDir);
      execSync(`unzip -o -q "${old_apk}" -d "${oldDir}"`);
      execSync(`unzip -o -q "${new_apk}" -d "${newDir}"`);

      const aapt = findAapt();
      let manifestDiff = "(aapt not found — manifest diff skipped)";
      if (aapt) {
        const oldManifest = execFileSync(aapt, ["dump", "xmltree", old_apk, "AndroidManifest.xml"], { encoding: "utf8" });
        const newManifest = execFileSync(aapt, ["dump", "xmltree", new_apk, "AndroidManifest.xml"], { encoding: "utf8" });
        fs.writeFileSync(path.join(tmp, "old_manifest.txt"), oldManifest);
        fs.writeFileSync(path.join(tmp, "new_manifest.txt"), newManifest);
        try {
          manifestDiff = execSync(`diff -u "${path.join(tmp, "old_manifest.txt")}" "${path.join(tmp, "new_manifest.txt")}" || true`, {
            encoding: "utf8",
          });
          if (!manifestDiff.trim()) manifestDiff = "(no manifest differences)";
        } catch (e) {
          manifestDiff = String(e);
        }
      }

      // Multidex apps split classes across classes.dex, classes2.dex, classes3.dex, ... —
      // diffing only classes.dex silently misses app code that landed in a later dex file
      // (e.g. classes.dex is often just the desugared stdlib; app code can end up in classes3.dex).
      // Compare every dex file present in either build, by name.
      const oldDexFiles = fs.readdirSync(oldDir).filter((f) => /^classes\d*\.dex$/.test(f));
      const newDexFiles = fs.readdirSync(newDir).filter((f) => /^classes\d*\.dex$/.test(f));
      const allDexNames = [...new Set([...oldDexFiles, ...newDexFiles])].sort();

      const sizeLines = [];
      const stringDiffs = [];
      for (const name of allDexNames) {
        const oldPath = path.join(oldDir, name);
        const newPath = path.join(newDir, name);
        const oldExists = fs.existsSync(oldPath);
        const newExists = fs.existsSync(newPath);
        const oldSize = oldExists ? fs.statSync(oldPath).size : 0;
        const newSize = newExists ? fs.statSync(newPath).size : 0;

        if (!oldExists) {
          sizeLines.push(`${name}: added in new.apk (${newSize} bytes)`);
          continue;
        }
        if (!newExists) {
          sizeLines.push(`${name}: removed in new.apk (was ${oldSize} bytes)`);
          continue;
        }
        sizeLines.push(`${name}: ${oldSize} -> ${newSize} bytes (delta ${newSize - oldSize})${oldSize === newSize ? " [identical size]" : ""}`);

        const oldStrings = execSync(`strings "${oldPath}" | sort -u`, { encoding: "utf8" });
        const newStrings = execSync(`strings "${newPath}" | sort -u`, { encoding: "utf8" });
        if (oldStrings === newStrings) continue; // no point emitting a no-op diff per file
        const oldFile = path.join(tmp, `${name}.old.strings`);
        const newFile = path.join(tmp, `${name}.new.strings`);
        fs.writeFileSync(oldFile, oldStrings);
        fs.writeFileSync(newFile, newStrings);
        const d = execSync(`diff -u "${oldFile}" "${newFile}" || true`, { encoding: "utf8" });
        if (d.trim()) stringDiffs.push(`--- ${name} string-pool diff ---\n${d}`);
      }

      const listDiff = sizeLines.join("\n");
      const stringDiff = stringDiffs.length ? stringDiffs.join("\n\n") : "(no string-pool differences in any dex file)";

      fs.rmSync(tmp, { recursive: true, force: true });

      return text(
        [
          "## APK diff (compiled binary, not source)",
          listDiff,
          "",
          "### AndroidManifest.xml diff",
          "```",
          manifestDiff.slice(0, 4000),
          "```",
          "",
          "### classes.dex string-pool diff (reveals changed string literals — e.g. SharedPreferences keys/file names, constants)",
          "```",
          stringDiff.slice(0, 4000),
          "```",
        ].join("\n")
      );
    })
  );

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

  server.registerTool(
    "adb_install",
    {
      description: "Install (or upgrade in place with -r, preserving app data) an APK onto the connected emulator/device.",
      inputSchema: { apk_path: z.string() },
    },
    tool("adb_install", async ({ apk_path }) => text(adb(["install", "-r", apk_path])))
  );

  server.registerTool(
    "adb_force_stop",
    {
      description: "Force-stop an app (simulates the app being fully killed / swiped away), so the next launch is a cold start.",
      inputSchema: { package_id: z.string() },
    },
    tool("adb_force_stop", async ({ package_id }) => {
      adb(["shell", "am", "force-stop", package_id]);
      return text(`force-stopped ${package_id}`);
    })
  );

  server.registerTool(
    "adb_launch",
    {
      description: v2
        ? "Cold-start an app's launcher activity, wait until it is on screen, and return the resulting screen state (same format as adb_dump_ui)."
        : "Launch an app's default launcher activity (cold start from the home screen).",
      inputSchema: { package_id: z.string() },
    },
    tool("adb_launch", async ({ package_id }) => {
      adb(["shell", "monkey", "-p", package_id, "-c", "android.intent.category.LAUNCHER", "1"]);
      if (!v2) return text(`launched ${package_id}`);
      // v1 traces: launch returned before the activity was up, so the next dump saw
      // mCurrentFocus=null and the agent had to dump again. Wait for it, then observe.
      const up = await waitForResumed(package_id, 10_000);
      return text(`launched ${package_id}${up ? "" : " (activity not resumed after 10s)"}\n\n${screenState()}`);
    })
  );

  server.registerTool(
    "adb_tap",
    {
      description: v2
        ? "Tap at (x, y) and return the resulting screen state (same format as adb_dump_ui). Use the tap=(x,y) centre of an element from the latest screen state."
        : "Tap the screen at pixel coordinates (x, y). Get coordinates from adb_dump_ui's element bounds first.",
      inputSchema: { x: z.number(), y: z.number() },
    },
    tool("adb_tap", async ({ x, y }) => {
      adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
      if (!v2) return text(`tapped (${x}, ${y})`);
      await sleep(800); // let the transition start; uiautomator dump then waits for idle
      return text(`tapped (${x}, ${y})\n\n${screenState()}`);
    })
  );

  server.registerTool(
    "adb_dump_ui",
    {
      description: v2
        ? "Return the current screen state: the resumed activity (ground truth for 'what screen am I on') and the app's visible elements with text, id and tap=(x,y) centre. adb_launch and adb_tap already return this; call it only to re-check."
        : "Dump the current screen: which activity is focused (ground truth for 'what screen am I on'), plus visible text elements and their tap bounds [left,top][right,bottom].",
      inputSchema: {},
    },
    tool("adb_dump_ui", async () => {
      if (v2) return text(screenState());
      const focus = adb(["shell", "dumpsys", "window"]).split("\n").find((l) => l.includes("mCurrentFocus")) || "(unknown)";
      adb(["shell", "uiautomator", "dump", "/sdcard/dump.xml"]);
      const xml = adb(["shell", "cat", "/sdcard/dump.xml"]);
      const elements = [...xml.matchAll(/text="([^"]*)"[^>]*resource-id="([^"]*)"[^>]*bounds="(\[[0-9,\[\]]*\])"/g)]
        .filter((m) => m[1] || m[2])
        .map((m) => `text="${m[1]}" id="${m[2]}" bounds=${m[3]}`);
      return text([`focused_window: ${focus.trim()}`, "elements:", ...elements].join("\n"));
    })
  );

  server.registerTool(
    "adb_screenshot",
    {
      description: "Capture a PNG screenshot of the current screen as evidence. Returns the saved file path.",
      inputSchema: { label: z.string().describe("filename label, e.g. old_after_login") },
    },
    tool("adb_screenshot", async ({ label }) => {
      const file = path.join(evidenceDir(), `${label}.png`);
      const buf = execFileSync(adbPath(), ["exec-out", "screencap", "-p"], { maxBuffer: 1024 * 1024 * 50 });
      fs.writeFileSync(file, buf);
      return text(`saved ${file}`);
    })
  );

  server.registerTool(
    "adb_logcat_clear",
    { description: "Clear the device logcat buffer, so a subsequent dump only shows fresh events.", inputSchema: {} },
    tool("adb_logcat_clear", async () => {
      adb(["logcat", "-c"]);
      return text("logcat cleared");
    })
  );

  server.registerTool(
    "adb_logcat_dump",
    {
      description: "Dump accumulated logcat since the last clear, filtered to app-relevant priority (warn+), as evidence.",
      inputSchema: { label: z.string() },
    },
    tool("adb_logcat_dump", async ({ label }) => {
      const out = adb(["logcat", "-d", "-v", "brief", "*:W"]);
      const file = path.join(evidenceDir(), `${label}.logcat.txt`);
      fs.writeFileSync(file, out);
      return text(`saved ${file} (${out.split("\n").length} lines)`);
    })
  );

  server.registerTool(
    "adb_uninstall",
    {
      description:
        "Uninstall an app and its data from the emulator. Use before a fresh-install journey: adb_install -r keeps existing app data, so it is not a fresh install.",
      inputSchema: { package_id: z.string() },
    },
    tool("adb_uninstall", async ({ package_id }) => {
      try {
        return text(adb(["uninstall", package_id]).trim());
      } catch (e) {
        // Not installed is fine: the goal state (app absent) already holds.
        if (/not installed|DELETE_FAILED_INTERNAL_ERROR|Unknown package/i.test(String(e.stdout) + String(e.stderr))) {
          return text(`${package_id} was not installed`);
        }
        throw e;
      }
    })
  );

  server.registerTool(
    "adb_wait_for_device",
    {
      description:
        "Wait until the emulator is connected and fully booted (up to timeout_s seconds). Use when adb reports 'device offline', 'no devices', or 'closed'.",
      inputSchema: { timeout_s: z.number().default(60) },
    },
    tool("adb_wait_for_device", async ({ timeout_s }) => {
      const deadline = Date.now() + timeout_s * 1000;
      adb(["wait-for-device"], { timeout: timeout_s * 1000 });
      while (Date.now() < deadline) {
        const booted = adb(["shell", "getprop", "sys.boot_completed"]).trim();
        if (booted === "1") return text("device online and booted");
        execSync("sleep 1");
      }
      return errorText(`device not booted after ${timeout_s}s`);
    })
  );

  // Optional: when the agent is given the app's source, entire-graph turns "which
  // class changed" (from diff_apks) into "which screens depend on it".
  if (sourceDir) {
    server.registerTool(
      "source_impact",
      {
        description:
          "Source is available for this app. Given a class that diff_apks shows changed (simple name, e.g. AuthManager), return its blast radius from the entire-graph code graph: direct and transitive callers (e.g. the Activities that construct or call it), callees and siblings. Use it to choose which screens and journeys to test.",
        inputSchema: { class_name: z.string() },
      },
      tool("source_impact", async ({ class_name }) => {
        const out = execFileSync(
          "entire",
          ["graph", "impact", "--repo", sourceDir, "--symbol", class_name, "--depth", "2", "--format", "text", "--exclude-tests"],
          { encoding: "utf8", cwd: sourceDir, maxBuffer: 1024 * 1024 * 10 }
        );
        return text(out.replace(/^Index: .*\n/, ""));
      })
    );
  }

  server.registerTool(
    "write_report",
    {
      description: "Persist the final regression report (markdown) to disk as evidence/REPORT.md. Call this before requesting release approval.",
      inputSchema: { markdown: z.string() },
    },
    tool("write_report", async ({ markdown }) => {
      const file = path.join(evidenceDir(), "REPORT.md");
      fs.writeFileSync(file, markdown);
      return text(`saved ${file}`);
    })
  );

  server.registerTool(
    "request_release_approval",
    {
      description: v2
        ? "REQUIRED FINAL STEP. Request human sign-off before the release can ship. This call pauses for a human Allow/Deny. Verdict: PASS (journeys ran on both builds, no regression), REGRESSION_DETECTED (a journey ended differently on new.apk, with evidence), or INCONCLUSIVE (the journeys could not be run or completed, so there is no device evidence either way). Include a one-paragraph summary."
        : "REQUIRED FINAL STEP. Request human sign-off before the release can ship. This tool call itself pauses for human approval (destructive gate) — call it with your final verdict (PASS or REGRESSION_DETECTED) and a one-paragraph summary. Do not skip this even if no regression was found.",
      inputSchema: {
        verdict: v2 ? z.enum(["PASS", "REGRESSION_DETECTED", "INCONCLUSIVE"]) : z.enum(["PASS", "REGRESSION_DETECTED"]),
        summary: z.string(),
      },
      annotations: { destructiveHint: true, title: "Approve release" },
    },
    tool("request_release_approval", async ({ verdict, summary }) => {
      return text(`Human approved release. verdict=${verdict} summary=${summary}`);
    })
  );
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  const server = buildServer(req.get("x-toolset") || "v2", req.get("x-source-dir") || null);
  await server.connect(transport);
  const evidenceDir = req.get("x-evidence-dir") || null;
  await requestContext.run({ evidenceDir }, () => transport.handleRequest(req, res, req.body));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`release-gate-tools MCP server on http://127.0.0.1:${PORT}/mcp`);
  console.log(`android sdk: ${sdkHome() || "(not found — set ANDROID_HOME)"}`);
  console.log(`default evidence dir: ${DEFAULT_EVIDENCE_DIR}`);
  if (Object.keys(faultBudget).length) console.log(`FAULT INJECTION ON: ${JSON.stringify(faultBudget)}`);
});
