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

## Demo

Pending.

## Known limitations and next steps

Pending.

## Submission

Pending. Submissions open Oct 12, 7:00–11:55 PM IST.
