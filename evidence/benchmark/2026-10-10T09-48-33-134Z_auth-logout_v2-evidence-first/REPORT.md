# Release Regression Report — com.example.releasedemo 1.0 (1) → 2.0 (2)

## Verdict: **REGRESSION_DETECTED**
Users who are logged in get **logged out when they upgrade** from 1.0 to 2.0. A fresh install of 2.0 works correctly, so only upgrading users are affected, but that is every logged-in user of the shipped build.

## What changed (binary diff)
- Manifest: only versionCode 1→2 and versionName 1.0→2.0. No permission or component changes.
- `classes3.dex`: only `Lcom/example/releasedemo/AuthManager;` changed (class hash 52b50d4a → a4244d02). All other classes are identical.
- String pool:
  - removed `session_prefs`, added `auth_prefs`. The SharedPreferences file was renamed.
  - removed `is_logged_in`. The login-flag key literal was dropped or renamed.
- Implication: v2 reads session state from a new prefs file and/or key, and nothing migrates the data v1 saved.

## Journeys and rationale
1. **Upgrade (old → new in place):** checks whether the session persisted by v1 survives the prefs rename.
2. **Fresh-install control (new):** separates an upgrade-only regression from a broken login on v2.
3. **Old-build persistence baseline:** shows the session survives a cold start on v1 (done during journey 1 setup).

## Results
| Journey | Old build end state | New build end state | Verdict |
|---|---|---|---|
| Log in, force-stop, relaunch (persistence) | DashboardActivity "Welcome, demo" | DashboardActivity "Welcome, demo" (fresh install) | Same |
| Log in on v1 → install v2 in place → relaunch | DashboardActivity "Welcome, demo" (before upgrade) | **LoginActivity "Sign in"**: session lost | **REGRESSION** |

## Evidence
- `old_logged_in_after_relaunch.png`: v1, logged in after a cold relaunch
- `new_after_upgrade_logged_out.png`: v2 after the in-place upgrade, back on LoginActivity
- `upgrade_old_to_new.logcat.txt`: logcat (warn+) captured around the upgrade and relaunch. The failure is a silent logout, not a crash.
- `new_fresh_install_logged_in_after_relaunch.png`: v2 fresh install, login persists

## Tool failures / recovery
None. Every tool call succeeded on the first attempt.

## Root cause
`AuthManager` in v2 opens `getSharedPreferences("auth_prefs", …)` instead of `"session_prefs"` and no longer uses the `is_logged_in` key. The session that v1 wrote to `session_prefs` is never read and never migrated. After the upgrade, the splash/auth check finds no session and sends the user to LoginActivity.

## Suggested fix (tactical)
Add a one-time migration in `AuthManager` (adjust the new key names to match v2):
```kotlin
class AuthManager(context: Context) {
    private val prefs = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE)

    init { migrateLegacySession(context) }

    private fun migrateLegacySession(context: Context) {
        val legacy = context.getSharedPreferences("session_prefs", Context.MODE_PRIVATE)
        if (legacy.all.isEmpty()) return
        if (legacy.getBoolean("is_logged_in", false)) {
            prefs.edit()
                .putBoolean(KEY_LOGGED_IN, true)            // v2's logged-in key
                .putString(KEY_USERNAME, legacy.getString("username", null))
                .apply()
        }
        legacy.edit().clear().apply()
    }
}
```
Another option is to revert the file name to `session_prefs` and the key to `is_logged_in`.

## Structural recommendation
- Treat persisted-storage identifiers (prefs file names, keys, DB schema) as a versioned contract: keep them in one constants file and require a migration plus an upgrade test whenever they change.
- Add an automated upgrade-path test to CI (install the previous release, create state, install the RC in place, assert the state survived).
