# Release Regression Report — com.example.releasedemo 1.0 (vc1) → 2.0 (vc2)

**Verdict: REGRESSION_DETECTED. Users who are logged in get logged out when they upgrade.**

## 1. What changed (compiled-binary diff)
- Manifest: only versionCode/versionName changed (1→2, "1.0"→"2.0"). No permission or component changes.
- `classes.dex` and `classes2.dex` are byte-identical in size. `classes3.dex` is 24 bytes smaller.
- Class hashes: **only `Lcom/example/releasedemo/AuthManager;` changed** (52b50d4a → a4244d02). LoginActivity, DashboardActivity and SplashActivity are unchanged.
- String pool in classes3.dex:
  - removed `session_prefs` and added `auth_prefs`: the SharedPreferences **file name** was renamed
  - removed `is_logged_in`: the login-flag key literal is gone. The new build presumably derives login state from a key that is still in the pool (e.g. the stored username via `putString`) inside the new file.

**Impact hypothesis:** AuthManager now reads session state from `auth_prefs`. Existing users have their session in `session_prefs`, and nothing migrates it. Expected result: everyone already logged in is silently logged out after the update.

## 2. Journeys tested (live emulator)
| # | Journey | old.apk | new.apk |
|---|---------|---------|---------|
| A | Log in, force-stop, relaunch (baseline persistence) | Dashboard, "Welcome, demo" ✅ | — |
| B | **Upgrade in place**: logged in on old, force-stop, `install -r new.apk`, relaunch | — | ❌ **Sign in screen** (session lost) |
| C | Fresh install of new: log in, force-stop, relaunch | — | Dashboard, "Welcome, demo" ✅ |

Notes: There is no text-input tool, so I logged in with blank fields. The app's `ifBlank` fallback uses the user "demo", and both builds handled this the same way.

## 3. Findings
- Journey B: the same user state that survives a restart on 1.0 is gone after upgrading to 2.0. The UI dump after the upgrade shows the LoginActivity widgets ("Sign in", usernameInput, passwordInput, LOG IN) instead of DashboardActivity's welcomeText and logoutButton.
- Journey C shows the new build's own login and persistence logic works. **The regression only affects upgrades**, which means every currently logged-in 1.0 user. That is the whole installed base, and fresh installs and QA on clean devices won't catch it.
- No crash: the session is lost silently, with no error.

## 4. Suggested fix
### Tactical: one-time migration in `AuthManager` (keep the new file name)
```kotlin
class AuthManager(context: Context) {
    private val prefs = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE)

    init { migrateLegacySession(context) }

    private fun migrateLegacySession(context: Context) {
        if (prefs.getBoolean("migrated_from_session_prefs", false)) return
        val legacy = context.getSharedPreferences("session_prefs", Context.MODE_PRIVATE)
        if (legacy.getBoolean("is_logged_in", false)) {
            prefs.edit()
                .putBoolean("is_logged_in", true)          // or whatever key/flag v2 checks
                .putString("username", legacy.getString("username", null))
                .apply()
        }
        prefs.edit().putBoolean("migrated_from_session_prefs", true).apply()
        legacy.edit().clear().apply()                       // optional: after migration verified
    }
    // isLoggedIn(): keep reading the same key v1 used ("is_logged_in"), or derive it from the migrated data
}
```
The simplest alternative is to revert the file name to `session_prefs` and restore the `is_logged_in` key. If the rename wasn't intentional, this is the lowest-risk fix.

### Structural
- Treat persisted keys and file names as a versioned schema. Put them in a single constants object, and add a lint/CI check that fails when a persisted identifier changes without a migration.
- Move to Jetpack DataStore with `SharedPreferencesMigration("session_prefs")`, which migrates the old data in one atomic step.
- Add an automated upgrade test to CI (install the previous release, log in, `install -r` the candidate, assert the Dashboard shows). This release gate did exactly that by hand.

## 5. Evidence
- `old_login_screen.png`: old build, first launch
- `old_dashboard_logged_in.png`: old build after login
- `old_phase.logcat.txt`
- `new_after_upgrade_logged_out.png`: **regression: Sign in screen after the in-place upgrade**
- `new_after_upgrade.logcat.txt`
- `new_fresh_install_relaunch_logged_in.png`: fresh install of the new build keeps the session
- `new_fresh_install.logcat.txt`

(All under runs/2026-10-10T09-46-56-227Z_auth-logout_v1-baseline/)
