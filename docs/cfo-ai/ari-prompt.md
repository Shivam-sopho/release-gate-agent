Paste message 1 into cfo.ai's assistant (Ari). After it builds the model, send messages 2 and 3.
Screenshot each answer: the model and charts, the runway and the scenario comparison.

---

**Message 1: build the model**

I'm building release-gate-agent, an AI agent that checks Android app releases before they ship. It diffs the old and new compiled builds, tests the user journeys at risk on a real emulator, and blocks the release until a human approves. Please build an 18-month operating model with revenue, COGS, gross margin, burn, cash and runway.

Pricing:
- Free: 1 app, 10 checks/month (acquisition)
- Team: $199/month per app, 100 checks included, $2 per extra check. Typical usage is 40 checks/month.
- Enterprise: $1,500/month, unlimited apps, self-hosted runner, SSO. Enterprise COGS is 30% of revenue.

Unit cost (COGS) per release check: $1.10 = $1.00 model/LLM cost + $0.10 cloud emulator time. On our demo apps the measured model cost is $0.21 per check (traced in neatlogs). We budget $1.00 for real, larger apps.

Fixed costs: $3,450/month = $3,000 founder stipend + $300 infra + $150 tools.
Starting cash: $25,000.

Growth assumptions:
- Team customers: 3 in month 1, +3 every month
- Enterprise: first customer in month 6, second in month 10
- Free apps: 20 in month 1, +10 every month, averaging 5 checks each

**Message 2: runway and break-even**

What's the break-even month, the lowest cash balance, and the runway? Which single assumption does the plan depend on most?

**Message 3: pressure-test**

Pressure-test it with a downside scenario: Team growth of +1.5 customers/month instead of +3, no Enterprise customers, and COGS of $1.60 per check (bigger apps than budgeted). Compare it with the base plan: does the cash run out, and when? What would you change in pricing to stay above $10,000 cash?

---

Expected base-case results, from our own spreadsheet (`projection.csv`), to sanity-check Ari:
break-even in **month 6** (18 Team + 1 Enterprise), lowest cash about **$13.6k** (month 5), gross
margin about 69% at steady state, cash about $55k at month 18.
