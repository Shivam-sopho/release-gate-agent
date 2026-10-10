# Business plan: release-gate-agent

Built with cfo.ai (screenshots below). The unit costs come from measured agent runs (neatlogs
traces and `evidence/benchmark/`). Everything else is labelled as an **assumption**: it's a
planning input, not a result.

## The customer and the problem

Mobile teams that ship Android releases weekly or every two weeks. Their release engineer or QA
lead signs off a build without knowing which user journeys the compiled change actually touches.
The bugs that slip through are the quiet ones, like upgrade data loss or silent logouts, and they
surface as 1-star reviews after rollout. A rollback costs days, and the users already affected
stay affected.

## What we sell

A release check: two APKs in, an evidence-backed verdict out, and a human gate before the build
ships. It plugs into CI as the last step before store upload.

## Unit economics (measured, then budgeted for real apps)

| | Demo apps (measured) | Production budget (assumption) |
|---|---|---|
| Model cost per check | **$0.21** avg (v2, n=4; range $0.18–$0.22) | **$1.00** (real apps: about 3–5× more journeys and screens) |
| Wall time per check | 82 s | 5–8 min |
| Emulator compute per check | local | **$0.10** (cloud Android device at about $1/hour, 6 min) |
| **Cost of goods per check** | | **≈ $1.10** |

The v1 → v2 improvement (−22% cost, −38% turns at equal accuracy) came straight out of the
neatlogs traces, and it's the lever we keep using: every point of efficiency goes straight to
gross margin.

## Pricing

| Plan | Price | Includes | Gross margin at full usage | Gross margin at typical usage (40%) |
|---|---|---|---|---|
| Free | $0 | 1 app, 10 checks/month | n/a (acquisition) | n/a |
| Team | **$199/month per app** | 100 checks/month, overage $2/check | 45% | 78% |
| Enterprise | from **$1,500/month** | unlimited apps, self-hosted runner (customer's own devices), SSO, audit log | 70%+ (assumption) | n/a |

Anchor: one silent upgrade regression caught before rollout is worth more than a year of Team.

## Costs (monthly, assumption)

| Item | $/month |
|---|---|
| Founder stipend (1 founder) | 3,000 |
| Fixed infra (control plane, storage, monitoring, neatlogs) | 300 |
| Tools and services | 150 |
| **Fixed total** | **3,450** |
| Variable | ≈ $1.10 per check |

## Revenue and runway (assumption)

- Starting cash: **$25,000** (founder savings + small angel cheque).
- Growth: 3 Team customers in month 1, +3 per month, first Enterprise in month 6, a second in
  month 10.
- Free apps: 20 in month 1, +10/month, averaging 5 checks each (their cost is included in COGS).
- Base case (`docs/cfo-ai/projection.csv`): **break-even in month 6** (18 Team + 1 Enterprise),
  lowest cash **≈ $13.6k** in month 5, steady-state gross margin ≈ 69%, cash ≈ $55k by month 18.
  Without Enterprise, break-even needs about 22 Team customers at typical usage ($155 gross
  profit each, before free-tier cost).

The month-by-month revenue, burn and runway are modelled in cfo.ai. See the screenshots below.

## cfo.ai model

Prompts used with cfo.ai's assistant: [`cfo-ai/ari-prompt.md`](cfo-ai/ari-prompt.md) (base model,
runway and break-even, and a downside pressure-test).

> Screenshots to add: model, runway, downside scenario.

## Risks

- Model costs on large apps can exceed the $1.00 budget. Mitigations: tighter screen state,
  smaller models for navigation steps (a neatlogs-driven experiment), and caching journeys
  between releases.
- Emulator flakiness: handled by the recovery loop (see the failure-recovery evidence), but it
  increases cost per check.
- Platform competition (Firebase Test Lab, AI QA startups). Our edge is that we start from the
  compiled binary diff, not a crawl or a source diff, and we gate on evidence.
