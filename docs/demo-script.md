# Demo video script (about 3 min)

Record with QuickTime: **File → New Screen Recording** (or Cmd+Shift+5), and turn on the
microphone in Options. Before you start, have these windows open: the emulator, the control panel
(http://127.0.0.1:8792), the neatlogs dashboard, entire.io (the checkpoint page), and the GitHub
README. Upload the result to YouTube as **Unlisted** and copy the link.

---

**0:00–0:20 · The problem** (README on screen)
> "Every app update can break things users already had. Here, an update silently logs everyone
> out, with no crash and no error. Fresh installs work, so normal testing misses it.
> release-gate-agent tests what actually ships: the compiled app, not the source code."

**0:20–1:30 · The agent, live** (control panel + emulator side by side)
- Drop `scenarios/auth-logout/old.apk` and `new.apk` into the panel and click **Run release check**.
> "It diffs the two compiled builds. Only one class changed, AuthManager, and a settings file was
> renamed. From that, it plans which journeys are at risk."
- While it runs, point at the emulator:
> "This is a real emulator. It logs in on the old version, upgrades in place, and checks whether
> the user is still logged in. Then it tries a fresh install, to tell an upgrade-only bug apart
> from one that hits everyone."
- When the approval card appears:
> "Regression detected, with evidence. And it can't ship anything by itself: a human has to
> approve. That gate is enforced by the harness, not by the agent promising to stop."
- Click **Allow** (or Deny), then open **View report**: results table, screenshots, root cause,
  suggested fix in code.

**1:30–2:10 · neatlogs: how we improved it** (neatlogs dashboard, a v1 trace next to a v2 trace)
> "Every run is traced in neatlogs. Reading the first traces, we found three problems: the agent
> looked at the screen before the app had loaded, it spent a whole step looking after every tap,
> and it had no way to say 'I couldn't test this'. We fixed all three. Across 8 real runs, same
> accuracy, 8 out of 8, with 38% fewer steps and 22% lower cost."
- Show the README results table for 3 seconds.
- Show the failure-recovery trace:
> "Here the emulator drops twice, during install and on a tap. The agent waits, retries,
> re-checks the screen, and still gets the right answer."

**2:10–2:40 · Entire** (entire.io checkpoint page, then `docs/entire.md`)
> "Entire is part of how we build and part of the agent itself. Coding sessions are checkpointed:
> here's the session that fixed the inconclusive verdict, with the prompt, the decisions and the
> diff. And the agent uses entire-graph: when source code is available, it asks which screens
> depend on the changed class. AuthManager leads to Splash, Login and Dashboard. That's how it
> knows what to test."

**2:40–3:00 · cfo.ai and close** (cfo.ai plan screenshot)
> "Because neatlogs gives us the real cost per check, we planned the business in cfo.ai: $199 a
> month per app, about $1.10 cost per check at production scale, and break-even at about 22
> customers. release-gate-agent: test what actually ships, and never ship without a human."
