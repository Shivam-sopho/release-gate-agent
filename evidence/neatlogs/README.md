# neatlogs evidence

## Before → after, on the same scenario (auth-logout), as neatlogs shows it

| | v1 baseline (`13-…`, 3:17 PM) | v2 evidence-first (`10-…`, 3:18 PM) |
|---|---|---|
| Steps (LLM + tool spans) | **66** | **45** (−32%) |
| Duration | 95 s | 77 s (−19%) |
| Verdict | REGRESSION_DETECTED | REGRESSION_DETECTED |
| Run folder (in the trace output) | `…09-46-56-227Z_auth-logout_v1-baseline` | `…09-48-33-134Z_auth-logout_v2-evidence-first` |

The averages over all 8 benchmark runs are in the README (turns −38%, cost −22%).

Workflow `apk-release-check`. Every run is one trace. The root is a `claude_agent.query` AGENT
span, with one LLM span per model turn and one TOOL span per MCP tool call. Traces are tagged
`prompt:`, `toolset:` and `scenario:`.

| File | What it shows |
|---|---|
| `01-trace-list.png` | All runs on Oct 10. The 03:25 PM trace is the failure-recovery run (3 failed tool calls). |
| `02-failure-recovery-trace-top.png` | Failure-recovery run: `diff_apks`, `source_impact` (entire-graph), then `adb_install` **ERROR** (injected "device offline") and the `adb_launch` that failed with it, then `adb_wait_for_device` and a successful `adb_install` retry. |
| `03-failure-recovery-tap-error-and-retry.png` | `adb_tap` **ERROR** (injected "closed"), then `adb_wait_for_device`, a fresh `adb_dump_ui`, and a successful `adb_tap` retry. |
| `04-failure-recovery-output.png` | The run's final output: verdict, what changed, a results table from the emulator, and the fix. |
| `05-failure-recovery-output-device-problems.png` | The output's "Device problems" section: both recoveries reported by the agent. |
| `06-v2-notes-run-steps.png` | v2 run on the notes scenario (5:32 PM, the run that posted to Entire Trail #1): 49 steps, 107 s, plus the span graph. |
| `07-v2-notes-run-output.png` | Its output: REGRESSION_DETECTED with a results table, the fix, and a push-back on the gate ("You approved the release … I'd hold the release until the fix below is in."). |
| `08-v2-auth-run-output.png` | v2 run on the auth scenario, started from the control panel (5:17 PM, recorded for the demo video): output with results table and fix. |
| `09-v2-auth-run-steps.png` | Its steps: 46 steps, 94 s. |
| `10-v2-auth-benchmark-steps.png` | v2 benchmark run on auth (started 3:18 PM, run `2026-10-10T09-48-33-134Z_auth-logout_v2-evidence-first`): **45 steps, 77 s**. |
| `11-v2-auth-benchmark-gate-denied.png` | The same run's last steps: `request_release_approval` shows ERROR, which is the auto-deny gate. That is the "Execution Failed" explained above. |
| `13-v1-auth-benchmark-steps.png` | **v1** benchmark run on auth (started 3:17 PM, run `2026-10-10T09-46-56-227Z_auth-logout_v1-baseline`): **66 steps, 95 s**. Note the separate `adb_dump_ui` after every launch, which v2 removed. |
| `14-v1-auth-benchmark-gate-denied.png` | Its last steps, ending with the auto-deny gate ERROR. |
| `15-v1-auth-benchmark-output.png` | Its output, with the run folder name confirming v1. |
| `12-v2-auth-benchmark-output.png` | Its output: "the human reviewer denied it (automatic deny for this benchmark run), so I've stopped", plus the results table and fix. |

**About "Execution Failed" on the 03:15–03:21 PM traces.** These are the unattended benchmark
runs, started with `--gate auto-deny`. A denied release gate comes back to the SDK as a tool
error, so neatlogs flags it. Those runs had no other tool failures (`tool_errors: 0` in each
`evidence/benchmark/*/summary.json`). Later unattended runs use `--gate auto-allow`.
