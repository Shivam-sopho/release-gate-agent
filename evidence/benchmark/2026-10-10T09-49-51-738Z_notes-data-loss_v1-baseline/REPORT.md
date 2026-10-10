# Release Regression Report: com.example.notesdemo 1.0 (vc1) → 2.0 (vc2)

## Verdict: **REGRESSION_DETECTED**: every existing user loses all their notes when they upgrade

## 1. What changed (compiled-binary diff)
- Manifest: only versionCode 1→2 and versionName 1.0→2.0. No permission or component changes.
- `classes.dex` and `classes2.dex` are the same size. `classes3.dex` shrank by 904 bytes.
- The class hash for `MainActivity` and its lambdas is unchanged (`a0922ae5`). **Only `com.example.notesdemo.NotesStore` changed** (`8961cecd` → `f3062d96`).
- String-pool changes in `NotesStore`:
  - SharedPreferences file name: `"notes_store"` **removed**, `"notes_data"` **added**.
  - Storage key: `"all_notes"` (one string, read with `split`/`filter`, written with `plus`) **removed**. Replaced by `"note_"` + index keys and a `"count"` key.
- Impact: v2 reads a different prefs file with a different layout and has no migration code. Notes written by v1 can't be seen by v2.

## 2. Journeys tested (live emulator)
| # | Journey | Old (1.0) | New (2.0) |
|---|---|---|---|
| A | Save 2 notes, force-stop, relaunch (baseline persistence) | ✅ "• Note 121 / • Note 90" persisted | n/a |
| B | **Upgrade in place**: notes saved on 1.0, force-stop, `install -r` new.apk, relaunch | n/a | ❌ **"No notes yet."** Both notes gone |
| C | Fresh install of 2.0, save 2 notes, force-stop, relaunch | n/a | ✅ "• Note 927 / • Note 236" persisted |

Journey C shows the new storage works for new users. The regression **only hits upgrades**, which means every currently-shipped user. The 1.0 data probably still sits on disk in `notes_store.xml`, but the app never reads it, so to the user it looks like total data loss. I saw no crash; the app is silently empty.

Note: I had no text-entry tool, so the notes came from tapping Save with an empty input. That makes the app create an auto-titled note ("Note N"). This goes through the same `NotesStore` save path as user-written notes.

## 3. Evidence
- `old_notes_after_restart.png`: 1.0 showing 2 notes after a cold restart
- `new_after_upgrade.png`: 2.0 after the in-place upgrade showing "No notes yet." (**the regression**)
- `new_fresh_after_restart.png`: 2.0 on a fresh install, notes persist
- Logcat: `old_phase.logcat.txt`, `new_upgrade_phase.logcat.txt`, `new_fresh_phase.logcat.txt`
- The UI dumps (notesList text) for each step are recorded in the agent transcript.

## 4. Suggested fix
### Tactical: one-time migration in `NotesStore` (ship as 2.0.1 / before release)
```kotlin
class NotesStore(context: Context) {
    private val prefs = context.getSharedPreferences("notes_data", Context.MODE_PRIVATE)
    private val legacy = context.getSharedPreferences("notes_store", Context.MODE_PRIVATE)

    init { migrateFromV1() }

    private fun migrateFromV1() {
        val old = legacy.getString("all_notes", null) ?: return
        if (prefs.getInt("count", 0) == 0) {
            // LEGACY_DELIMITER must be exactly the separator v1 used in split()/plus
            // (copy the constant from the 1.0 NotesStore source).
            val notes = old.split(LEGACY_DELIMITER).filter { it.isNotBlank() }
            prefs.edit().apply {
                notes.forEachIndexed { i, n -> putString("note_$i", n) }
                putInt("count", notes.size)
            }.commit()   // commit (sync) so a crash can't half-migrate
        }
        legacy.edit().clear().apply()   // only after a successful write
    }
    // getAll()/add() unchanged ("note_$i" + "count")
}
```
If the rename wasn't needed, an even smaller fix is to go back to the file name `"notes_store"` and key `"all_notes"`.

### Structural
- Don't hand-roll a list format on SharedPreferences. Use **Room** (versioned schema with `Migration` objects and `MigrationTestHelper`), or **DataStore** with `SharedPreferencesMigration("notes_store")` for a built-in one-time import.
- Add an upgrade test to CI: install the previous release, write data, `install -r` the candidate, and assert the data is still there. Release-gate any change to persistence identifiers (pref file names, keys, DB names).
