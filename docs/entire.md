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

## 2. For the coding agent: checkpoints + entire-graph

- `entire enable --agent claude-code` installs Claude Code hooks (`.claude/settings.json`) and
  repo settings (`.entire/settings.json`). Checkpoints are stored as git refs and pushed to
  `origin` alongside commits.
- `entire graph init-agents` adds the entire-graph workflow to `AGENTS.md`/`CLAUDE.md`, so
  coding sessions search the graph before grepping.

Checkpoint and `entire graph stats` output: pending. The first coding session was started
outside the repo folder, so Entire's hooks did not attach to it. Later sessions run inside the
repo, and their checkpoints will be listed here.
