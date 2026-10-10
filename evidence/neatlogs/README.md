# neatlogs evidence

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

**About "Execution Failed" on the 03:15–03:21 PM traces.** These are the unattended benchmark
runs, started with `--gate auto-deny`. A denied release gate comes back to the SDK as a tool
error, so neatlogs flags it. Those runs had no other tool failures (`tool_errors: 0` in each
`evidence/benchmark/*/summary.json`). Later unattended runs use `--gate auto-allow`.
