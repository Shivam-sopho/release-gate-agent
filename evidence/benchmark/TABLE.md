| Prompt | Scenario | Runs | Verdicts | Turns (avg) | Tool calls (avg) | Time s (avg) | Cost $ (avg) | Cached input tokens (avg) | Output tokens (avg) |
|---|---|---|---|---|---|---|---|---|---|
| v1-baseline | auth-logout | 2 | REGRESSION_DETECTED×2 | 40.0 | 39.0 | 101.8 | 0.262 | 223297 | 6058 |
| v1-baseline | notes-data-loss | 2 | REGRESSION_DETECTED×2 | 38.0 | 37.0 | 97.1 | 0.267 | 205151 | 6027 |
| v2-evidence-first | auth-logout | 2 | REGRESSION_DETECTED×2 | 24.0 | 23.0 | 77.5 | 0.198 | 117535 | 4660 |
| v2-evidence-first | notes-data-loss | 2 | REGRESSION_DETECTED×2 | 24.5 | 23.5 | 85.8 | 0.213 | 159941 | 5028 |

8 runs: 2026-10-10T09-37-55-694Z_auth-logout_v1-baseline, 2026-10-10T09-42-09-813Z_auth-logout_v2-evidence-first, 2026-10-10T09-44-05-755Z_notes-data-loss_v1-baseline, 2026-10-10T09-45-33-185Z_notes-data-loss_v2-evidence-first, 2026-10-10T09-46-56-227Z_auth-logout_v1-baseline, 2026-10-10T09-48-33-134Z_auth-logout_v2-evidence-first, 2026-10-10T09-49-51-738Z_notes-data-loss_v1-baseline, 2026-10-10T09-51-45-724Z_notes-data-loss_v2-evidence-first
