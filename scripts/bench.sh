#!/usr/bin/env bash
# Runs the agent repeatedly for each "scenario:prompt" pair with the release gate
# on auto-allow (unattended benchmark), then prints the comparison table.
#   scripts/bench.sh notes-data-loss:v1-baseline auth-logout:v2-evidence-first ...
set -u
cd "$(dirname "$0")/../agent"
since=$(date -u +%Y-%m-%dT%H:%M:%S)
for pair in "$@"; do
  scenario=${pair%%:*}
  prompt=${pair##*:}
  echo "=== $scenario $prompt $(date +%T)"
  node --env-file-if-exists=../.env run.mjs --scenario "$scenario" --prompt "$prompt" --gate auto-allow \
    > "../runs/bench-$scenario-$prompt-$(date +%s).log" 2>&1
  echo "exit $?"
done
node ../scripts/compare-runs.mjs --since "$since"
