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
| Team | **$199/month per app** (initial) → **$349/month, 50 checks, $3 overage** (after cfo.ai downside test) | 100 → 50 checks/month | 45% → 77% | 78% → 82% |
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

**Live cfo.ai model (public links):**

- [When does the plan turn cash-flow positive, and how much cushion remains?](https://cfo.ai/s/jWmktN7bEdLMt1m1): operating dashboard
- [How the 18-month forecast measures burn, cash flow, and runway](https://cfo.ai/s/zze83cWNe8lwvVTN): monthly forecast
- [What operating assumptions shape the financial plan?](https://cfo.ai/s/U1TR9W2XvuSiuaog): assumptions
- [Can Team pricing protect the $10,000 reserve under the downside?](https://cfo.ai/s/6lbcuRXXY-u6pln5): downside and pricing decision

Prompts used with cfo.ai's assistant Ari: [`cfo-ai/ari-prompt.md`](cfo-ai/ari-prompt.md).

**Base case (cfo.ai):** cash-flow positive in **month 6 (Mar-27)**, by $5 that month. Lowest cash
**$13,625** (Feb-27), month-18 cash **$55,120**. These match our own spreadsheet
(`cfo-ai/projection.csv`) exactly. Ari also built an interactive dashboard with a model-cost
slider, and slower and faster growth cases. In the slower case, cash falls to $3,280.

**Downside (cfo.ai):** Team growth +1.5/month, no Enterprise, COGS $1.60/check. With the original
pricing, **cash runs out**: −$13,947.50 by month 18, with net cash flow negative throughout. At
$1.60/check the 100-check allowance leaves only 19.6% Team margin.

**Pricing decision (cfo.ai's recommendation, adopted):** Team **$349/month per app, 50 included
checks, $3 per extra check**. In the downside case, minimum cash is **$12,690** (month 8, May 2027),
cash flow turns positive in month 9, and month-18 cash is $28,577.50. Team margin is 81.7% at
typical usage, 77.1% at all 50 included checks, and 46.7% on overages. The floor price that keeps
$10,000 of reserve in the downside is $318; $349 adds a cushion. Caveat (Ari's): this is a 75%
price increase. The model proves the cash arithmetic, not willingness to pay, so test it with
customers first.

| Screenshot | |
|---|---|
| [`01-operating-dashboard.png`](../evidence/cfo-ai/01-operating-dashboard.png) | Dashboard: $55,120 / $13,625 / Mar-27, cash curve, cost slider |
| [`02-monthly-forecast.png`](../evidence/cfo-ai/02-monthly-forecast.png) | 18-month operating forecast table |
| [`03-downside-and-pricing-decision.png`](../evidence/cfo-ai/03-downside-and-pricing-decision.png) | Downside comparison and the $349 pricing recommendation |

## Risks

- Model costs on large apps can exceed the $1.00 budget. Mitigations: tighter screen state,
  smaller models for navigation steps (a neatlogs-driven experiment), and caching journeys
  between releases.
- Emulator flakiness: handled by the recovery loop (see the failure-recovery evidence), but it
  increases cost per check.
- Platform competition (Firebase Test Lab, AI QA startups). Our edge is that we start from the
  compiled binary diff, not a crawl or a source diff, and we gate on evidence.
