# Entire in release-gate-agent

We use Entire in two ways: for the coding agent that builds this repo, and inside the release
agent itself.

## 1. Inside the agent: entire-graph turns "which class changed" into "which screens to test"

`diff_apks` tells the agent *which compiled class changed*, but not which screens depend on it.
When the app's source is available (`run.mjs --source <dir>`), the tool server exposes
`source_impact`, which runs `entire graph impact` on the changed class. The agent then uses the
callers to choose its journeys.

Output the agent received for the two demo regressions:

```text
$ entire graph impact --repo demo-apps/auth-app --symbol AuthManager --depth 2 --exclude-tests
Impact: AuthManager (app/src/main/java/com/example/releasedemo/AuthManager.kt:6) def=6 span=6-24 [class]
Blast radius: 3 callers (3 direct, 0 transitive), 0 callees, 0 type consumers, 0 data flows, 0 co-change files, 5 siblings.
Callers (3 direct, 0 transitive; who breaks if behavior changes):
- DashboardActivity.onCreate (app/src/main/java/com/example/releasedemo/DashboardActivity.kt:16, def :10) [CONSTRUCTS]
- LoginActivity.onCreate (app/src/main/java/com/example/releasedemo/LoginActivity.kt:19, def :10) [CONSTRUCTS]
- SplashActivity.onCreate (app/src/main/java/com/example/releasedemo/SplashActivity.kt:10, def :8) [CONSTRUCTS]
Callees (0; what it depends on):
- none
```

```text
$ entire graph impact --repo demo-apps/notes-app --symbol NotesStore --depth 2 --exclude-tests
Impact: NotesStore (app/src/main/java/com/example/notesdemo/NotesStore.kt:5) def=5 span=5-23 [class]
Blast radius: 1 caller (1 direct, 0 transitive), 0 callees, 0 type consumers, 0 data flows, 0 co-change files, 3 siblings.
Callers (1 direct, 0 transitive; who breaks if behavior changes):
- MainActivity.onCreate (app/src/main/java/com/example/notesdemo/MainActivity.kt:17, def :10) [CONSTRUCTS]
```

In run [`2026-10-10T09-54-58-908Z_auth-logout_v2-evidence-first`](../evidence/failure-recovery/2026-10-10T09-54-58-908Z_auth-logout_v2-evidence-first/REPORT.md) the agent called `source_impact` right
after `diff_apks` and wrote in its report: *"AuthManager is constructed by
SplashActivity.onCreate, LoginActivity.onCreate and DashboardActivity.onCreate. That covers
routing at app start, login and the dashboard."* It then chose the upgrade journey and the
fresh-install control from that.

## 2. Trails: the release verdict lands where the code is reviewed

`entire runner setup -y` added six trail runners (`.entire/runners/`), tailored by Entire to
this repo. The risk runner's first priority is *"human release gate integrity: any path that
lets a release proceed without an explicit human Allow"*.

With `run.mjs --trail <n>`, the release agent posts its result to that Trail as a discussion:
the verdict, the human gate decision, the agent's evidence summary, turns, wall time, cost and
the report path. So a release candidate's Trail carries both the runners' review of the *code*
and the agent's on-device evidence about the *build*, and a human approves on the Trail.

[Trail #1](https://entire.io/gh/Shivam-sopho/release-gate-agent/trails/1) built this feature
(branch `feat/trail-verdicts`, checkpoint `01M4JV24R4C7SD44XX5173KCD5`). Its first real use was a
run on the notes scenario that posted:

> **Release gate: REGRESSION_DETECTED (notes-data-loss)**: Verdict REGRESSION_DETECTED, human
> gate allow. "2.0 silently loses all notes saved by existing users on upgrade. The binary diff
> shows only NotesStore changed … Fix: add a one-time migration in NotesStore …" Turns 25,
> wall time 105.2 s, cost $0.2224.

## 3. For the coding agent: checkpoints + entire-graph

- `entire enable --agent claude-code` installs Claude Code hooks (`.claude/settings.json`) and
  repo settings (`.entire/settings.json`). Checkpoints are stored as git refs and pushed to
  `origin` alongside commits.
- `entire graph init-agents` adds the entire-graph workflow to `AGENTS.md`/`CLAUDE.md`, so
  coding sessions search the graph before grepping.

### Checkpoints

| Checkpoint | Commit | What |
|---|---|---|
| `01M4JV24R4C7SD44XX5173KCD5` | `900ae19` (on [Trail #1](https://entire.io/gh/Shivam-sopho/release-gate-agent/trails/1)) | Post release-gate verdicts to an Entire Trail (`--trail`). Implemented by a Claude Code session on the Trail's branch. |
| `01M4JN7HHKQ28WF2HYV3VGEN0T` | [`d94f4ef`](https://entire.io/gh/Shivam-sopho/release-gate-agent/commit/d94f4ef370004e38a3259b8deb2840d7201a119f) | Control panel: distinct INCONCLUSIVE verdict state. A Claude Code session in this repo found that the approval card showed the new INCONCLUSIVE verdict as a red regression, and fixed it. 122.6k tokens, 1 file. |

Open a link on entire.io, then repository → commit → checkpoint, to see **Sessions** (the request
and the agent's decisions) and **Changes** (the diff). Locally:
`entire checkpoint explain 01M4JN7HHKQ28WF2HYV3VGEN0T`.

Note: the first coding session (agent loop, tools, benchmark) was started outside the repo
folder, so Entire's hooks did not attach to it, and that work has no checkpoints. Work done from
sessions inside the repo is captured.
