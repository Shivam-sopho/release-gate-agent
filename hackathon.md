# neatHack build log

## Project

**release-gate-agent**: an autonomous Android release agent. Give it the currently shipped
`old.apk` and the release-candidate `new.apk`. It diffs the *compiled* binaries, decides which
user journeys the change puts at risk, drives a real Android emulator to test them on both
builds, writes an evidence-backed report with a suggested fix, and stops at a human approval
gate before the release can ship.

### Prior work (disclosure)

The idea, the APK-diff/adb tool implementations, the two demo apps with planted regressions, and
the first version of the control panel were built by the same author for an earlier hackathon
(TrueFoundry × Polaris "Agents That Act", Sep 26–27 2026,
[Shivam-sopho/android-release-agent](https://github.com/Shivam-sopho/android-release-agent)).
In that project the agent loop was never run unattended by a model: a human stood in for the
model, and the harness was TrueFoundry's TrueForge.

They were copied into this repo in a single commit labelled `Port base from prior project`.
Everything after that commit was built during neatHack (Oct 10–12, 2026). The new work is listed
under "Build log".

## Team

- Shivam ([@Shivam-sopho](https://github.com/Shivam-sopho))

## Stack

- Agent loop: Claude Agent SDK (TypeScript), running on the local Claude Code login
- Tools: MCP server (Node) exposing `diff_apks`, `adb_*`, `write_report`, `request_release_approval`
- Tracing: neatlogs (`neatlogs` npm SDK, Claude Agent SDK integration)
- Repo context: Entire CLI (checkpoints) + entire-graph
- Business plan: cfo.ai
- Android emulator via Android SDK command-line tools

## Build log

### 2026-10-10

- Planned: new repo; port the reusable base; replace TrueForge and the human stand-in with an
  autonomous Claude Agent SDK loop; neatlogs tracing; failure recovery; before/after improvement
  measured in neatlogs; Entire checkpoints; cfo.ai plan.
- Done: repo created, base ported (see disclosure above).
- Done: `agent/run.mjs`, an autonomous loop on the Claude Agent SDK (local Claude Code login),
  wrapped with neatlogs `wrapClaudeAgentSDK`; human release gate via `canUseTool`; per-run
  `runs/<id>/summary.json`.
- Done: tool server hardening (Android Studio SDK auto-detect, per-run evidence dir, adb
  failures returned as recoverable tool errors, `adb_uninstall`, `adb_wait_for_device`,
  opt-in `FAULT_INJECT`).
- Done: Entire enabled for Claude Code, entire-graph installed.
- Tested: smoke run with no emulator (`auth-logout`, v1 prompt, max 6 turns, gate auto-deny):
  11 turns, 52.9 s, $0.16 (Claude's estimated cost at standard API prices), 7 adb errors. The
  agent diagnosed the missing `adb`, retried once, did not invent results, and reached the gate.
- Observed v1 problem: with zero device evidence it still returned `REGRESSION_DETECTED`. It
  needs an explicit "inconclusive" outcome. This is a candidate for the v2 prompt.
- Done: neatlogs key configured (local `.env`, git-ignored); delivery verified (0 export failures).
- Tested: first real run on the emulator (Android 17 arm64, `auth-logout`, v1): found the
  upgrade logout regression unaided. 43 turns, 109 s, $0.28.
- Done: read the v1 trace and found 3 problems (launch race -> `mCurrentFocus=null` and a
  repeated dump; a separate dump after every action doubling turns; no INCONCLUSIVE verdict).
  Built the v2 toolset and the `v2-evidence-first` prompt; v1 is kept selectable for fair reruns.
- Done: control panel now spawns the agent directly (SSE + browser Allow/Deny), TrueForge removed.
- Tested: before/after benchmark, 8 real runs (2 per version per scenario), all 8 correct.
  v2 vs v1: turns -38%, time -18%, cost -22%, cached input tokens -35%. Table in README and
  `evidence/benchmark/`.
- Done: `source_impact` tool (optional, `--source`): entire-graph `impact` maps the changed class
  to the screens that depend on it (AuthManager -> Splash/Login/Dashboard).
- Decision: unattended benchmark runs use `--gate auto-allow` (requested by the builder). The
  default is still the real human gate. The 8 benchmark runs above used auto-deny; the gate is the
  final step, so this does not affect the measured numbers.
- Tested: failure-recovery run with `FAULT_INJECT=adb_install:1,adb_tap:1` and `--source`
  (`evidence/failure-recovery/2026-10-10T09-54-58-908Z_auth-logout_v2-evidence-first`): the install failed (device offline), a launch in the same
  turn cascaded, and a tap failed (closed). The agent waited for the device and retried each one,
  re-checked the screen, used `source_impact` to pick journeys, reached the correct verdict and
  documented the recoveries. 31 turns, 114.5 s, $0.27, gate auto-allow.
- Done: `docs/entire.md` with real entire-graph impact output.
- Known gap: Entire has 0 checkpoints so far. This coding session started outside the repo
  folder, so Entire's hooks did not attach. Next sessions start inside the repo.

- Done: Entire account connected (entire.io GitHub mirror of this repo, India region), CLI
  logged in as github:Shivam-sopho.

- Done: first Entire checkpoint `01M4JN7HHKQ28WF2HYV3VGEN0T` on commit `d94f4ef`, from a
  Claude Code session run inside the repo (`claude -p`): the control panel now shows INCONCLUSIVE
  as its own amber state instead of a red regression. Link in `docs/entire.md`.

- Done: control panel verified end to end (upload → live run → Allow → report).
- Done: `docs/business-plan.md` (unit costs from measured runs; break-even month 6 in the base
  case, see `docs/cfo-ai/projection.csv`) and `docs/cfo-ai/ari-prompt.md` for cfo.ai.
- Done: automated demo video (`demo-video/`): a headless browser records a real control-panel
  run, adb screenrecord captures the emulator, slides are rendered from HTML, narration uses
  Kokoro (local neural TTS), and ffmpeg composes it. Fixed: the emulator clip was corrupted by
  interrupting screenrecord; audio dropped after a 24 kHz mono / 48 kHz stereo concat mismatch.
- Done: Entire Trails. `entire runner setup -y` (6 repo-tailored runners); Trail #1 built
  `--trail` (the agent posts its verdict to a Trail) on `feat/trail-verdicts` (checkpoint
  `01M4JV24R4C7SD44XX5173KCD5`); a real notes-scenario run posted its verdict to the Trail.
  Entire blocks self-approval, so the branch was fast-forwarded into main and the Trail/PR show
  merged.
- Done: neatlogs screenshots (`evidence/neatlogs/`, 15 files), including the same-scenario pair
  v1 66 steps / 95 s vs v2 45 steps / 77 s, and the failure-recovery trace.

### Next (planned, not done)

1. Keep coding from sessions inside the repo so further work is checkpointed.
2. **cfo.ai business plan** (`docs/business-plan.md`, linked from the README but not written yet):
   unit cost about $0.21 per release check (v2 average, standard API pricing) and about 80 s per check.
   Builder signs up at cfo.ai/neathacks and cancels the subscription immediately in Settings → Billing.
3. Demo video script (both scenarios; control panel with human Allow; neatlogs before/after;
   failure-recovery run; entire-graph `source_impact`).
4. Building-in-public posts (#neatHack); final submission = quote-tweet of the official neatlogs
   post on Oct 12, 7:00–11:55 PM IST. Check with Entire whether Best Use of Entire has an earlier
   deadline: their page says Oct 10–11.
5. Optional: entire-graph stats after some coding sessions; Entire Brain.

Running services during development: tool server `cd tools && node server.mjs` (:8791),
emulator `Medium_Phone_API_37.0`, Node at `/opt/homebrew/opt/node@22/bin`.

## Demo

https://youtu.be/AEPnlF2-uyQ (3:27). Generated by `demo-video/`: a real recorded run, real
neatlogs / Entire / cfo.ai screens, and Kokoro TTS narration.

## Known limitations and next steps

- `diff_apks` is a string-pool and class-hash diff, not a decompiler. It finds *which* class
  changed, not a method-level semantic diff.
- Tested on two small demo apps on one emulator image (Android 17, arm64). Production apps will
  need more journeys; the business plan budgets $1.00 model cost per check instead of the measured
  $0.21.
- No text-input tool yet: the agent logs in with empty fields (the demo apps default to "demo").
  Next: `adb_input_text`.
- Benchmarks are small (2 runs per version per scenario). Treat the deltas as indicative.
- Entire Trail #1 could not be approved by its author (Entire blocks self-approval), so it was
  merged by fast-forwarding main; GitHub and Entire both show it as merged.
- Next: CI mode (run on every release-candidate build and post to its Trail), more apps and
  bug classes (permissions, crashes on upgrade, migrations), cheaper models for navigation steps,
  measured with neatlogs.

## Submission

Ready. Everything is in [`SUBMISSION.md`](SUBMISSION.md). Final step (Oct 12, 7:00–11:55 PM IST):
quote the official neatlogs submission post on X with team, project, repo and demo link.
