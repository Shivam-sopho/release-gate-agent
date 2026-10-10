# neatHack submission: release-gate-agent

**Team:** Shivam ([@Shivam-sopho](https://github.com/Shivam-sopho))
**Project:** release-gate-agent. An autonomous Android release agent: it diffs the *compiled*
old and new APKs, tests the journeys that change puts at risk on a real emulator, writes an
evidence-backed report with a code-level fix, and stops at a human release gate.
**Repo:** https://github.com/Shivam-sopho/release-gate-agent
**Demo video:** DEMO_LINK

| Requirement | Evidence |
|---|---|
| Agent handles a substantial task end to end | [README: what the agent does](README.md#what-the-agent-does-end-to-end). Real runs with reports and screenshots: [`evidence/benchmark/`](evidence/benchmark) |
| Improvement (before/after runs, compared numbers) | v1 → v2 across 8 real runs: same 8/8 accuracy, **turns −38%, time −18%, cost −22%, cached input tokens −35%**. [README table](README.md#neatlogs-trace-every-run-then-use-the-traces-to-improve-the-agent), [`evidence/benchmark/TABLE.md`](evidence/benchmark/TABLE.md) |
| neatlogs traces | Workflow `apk-release-check`, tagged `prompt:v1-baseline` / `prompt:v2-evidence-first`. Screenshots: [`evidence/neatlogs/`](evidence/neatlogs) |
| Failure recovery | Install failed (device offline), a launch failed as a result, a tap failed (closed). The agent waited, retried and re-observed, then reached the correct verdict: [`evidence/failure-recovery/`](evidence/failure-recovery), [README section](README.md#failure-recovery) |
| Entire: checkpoints | Checkpoint `01M4JN7HHKQ28WF2HYV3VGEN0T`: https://entire.io/gh/Shivam-sopho/release-gate-agent/commit/d94f4ef370004e38a3259b8deb2840d7201a119f |
| Entire: entire-graph (inside the agent) | The `source_impact` tool runs `entire graph impact` to map a changed class to the screens that depend on it: [`docs/entire.md`](docs/entire.md) |
| cfo.ai business plan | [`docs/business-plan.md`](docs/business-plan.md): pricing, costs (from measured per-run cost), revenue, runway |
| Building in public | POST_LINKS |
| Commits during the hackathon | All commits are dated Oct 10, 2026 or later. Prior work is disclosed in [`hackathon.md`](hackathon.md) |
