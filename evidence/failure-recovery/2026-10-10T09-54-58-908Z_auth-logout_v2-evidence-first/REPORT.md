# Release Regression Report: com.example.releasedemo 1.0 (vc1) → 2.0 (vc2)

## Verdict: **REGRESSION_DETECTED**: users who update are logged out

## What changed (binary diff)
- Manifest: only versionCode/versionName changed (1 → 2, "1.0" → "2.0"). No permission or component changes.
- Only one app class has a different hash: `com.example.releasedemo.AuthManager` (52b50d4a → a4244d02). All other classes are identical.
- classes3.dex string pool:
  - removed `session_prefs`, added `auth_prefs` (the SharedPreferences file was renamed)
  - removed `is_logged_in` (the login-flag key changed)
- source_impact: AuthManager is constructed by `SplashActivity.onCreate`, `LoginActivity.onCreate` and `DashboardActivity.onCreate`. That covers routing at app start, login and the dashboard.

## Journeys and why
1. **Upgrade (old → new, data kept):** the prefs file rename puts existing users' stored session at risk.
2. **Fresh-install control (new only):** tells an upgrade-only problem apart from broken login for everyone.

## Results
| Journey | old.apk end state | new.apk end state | Verdict |
|---|---|---|---|
| Log in, force-stop, relaunch | DashboardActivity "Welcome, demo" (session kept) | n/a | baseline |
| Upgrade: log in on old, `adb install -r` new, relaunch | DashboardActivity (logged in before upgrade) | **LoginActivity** (session lost) | **REGRESSION** |
| Fresh install new: log in, force-stop, relaunch | n/a | DashboardActivity "Welcome, demo" | OK |

The bug only affects upgrades. A fresh install of 2.0 works. Every existing 1.0 user who updates gets logged out.

## Evidence
- `old_logged_in.png`: old build, DashboardActivity after a cold restart
- `new_after_upgrade.png`: new build after in-place upgrade, LoginActivity
- `upgrade.logcat.txt`: logcat around the upgrade and relaunch (765 lines, warn+). I did not review it line by line. No crash was seen on device; the app started normally on the login screen.
- `new_fresh_install_relaunch.png`: new build after fresh install, login and cold restart, DashboardActivity

## Tool failures and recovery
- First `adb_install old.apk` failed with "device offline". The `adb_launch` that followed failed because the app wasn't installed. I ran `adb_wait_for_device` and retried; the install succeeded.
- Tapping LOG IN on old.apk failed with "error: closed". I ran `adb_wait_for_device`, re-read the screen (still LoginActivity) and retried the tap; it succeeded.

## Root cause
`AuthManager` in 2.0 reads its session from SharedPreferences file `auth_prefs` and no longer uses the `is_logged_in` key. 1.0 wrote the session to `session_prefs` / `is_logged_in`. 2.0 has no migration, so on first launch after the update `isLoggedIn()` reads an empty file and returns false. SplashActivity then sends the user to LoginActivity.

## Suggested fix
Tactical fix: a one-time migration in `AuthManager` from the old file and key to the new ones. Replace `KEY_LOGGED_IN` / `KEY_USERNAME` with the key names 2.0 actually uses.
```kotlin
class AuthManager(context: Context) {
    private val prefs = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE)

    init { migrateLegacySession(context) }

    private fun migrateLegacySession(context: Context) {
        if (prefs.getBoolean("migrated_from_session_prefs", false)) return
        val legacy = context.getSharedPreferences("session_prefs", Context.MODE_PRIVATE)
        val editor = prefs.edit()
        if (legacy.getBoolean("is_logged_in", false)) {
            editor.putBoolean(KEY_LOGGED_IN, true)
            legacy.getString("username", null)?.let { editor.putString(KEY_USERNAME, it) }
        }
        editor.putBoolean("migrated_from_session_prefs", true).apply()
        legacy.edit().clear().apply()   // or context.deleteSharedPreferences("session_prefs") on API 24+
    }
    // ...
}
```
Simplest alternative: revert the file name to `session_prefs` and the key to `is_logged_in`.

Structural recommendations:
- Keep persisted-storage identifiers (prefs file names, keys, DB names) in one `StorageKeys` object and treat them as a stable contract. Renaming one should require a migration.
- Add an upgrade test to CI: install the previous release, log in, upgrade in place, then assert DashboardActivity. Jetpack DataStore's `SharedPreferencesMigration` can also handle this.
