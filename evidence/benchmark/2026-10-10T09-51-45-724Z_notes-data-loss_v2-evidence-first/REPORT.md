# Release Regression Report — com.example.notesdemo 1.0 (vc1) → 2.0 (vc2)

## Verdict: REGRESSION_DETECTED (data loss on upgrade)

## What changed (binary diff)
- Manifest: only versionCode/versionName (1→2, "1.0"→"2.0"). No permission or component changes.
- classes.dex / classes2.dex: same size. classes3.dex: −904 bytes. Only `com.example.notesdemo.NotesStore` changed (class hash 8961cecd → f3062d96). The hash for `MainActivity` did not change.
- String-pool changes in `NotesStore`:
  - SharedPreferences file name: `notes_store` → **`notes_data`**
  - Storage format: one `all_notes` key holding a delimited string (old code used `split$default`, `plus`, `filter`) → **per-note `note_<n>` keys plus a `count` key**
  - No migration code: nothing in the new build reads `notes_store` or `all_notes`.

Implied effect: v2 reads from a new, empty prefs file, so notes saved on v1 are not visible after an upgrade.

## Journeys and why
1. **Upgrade (old → new, in place):** this is the core user-data path that the changed `NotesStore` affects.
2. **Fresh-install control on new:** checks whether the bug only hits upgrades or hits every user.

## Results
| Journey | old.apk end state | new.apk end state | Verdict |
|---|---|---|---|
| Save 2 notes, force-stop, relaunch | "• Note 674 • Note 537" shown (notes persist) | n/a | baseline OK |
| Upgrade in place (adb install -r) and relaunch | 2 notes present before upgrade | **"No notes yet."** Both notes gone | **REGRESSION** |
| Fresh install new, save note, force-stop, relaunch | n/a | "• Note 438" persists | OK (new storage works) |

Conclusion: the bug only affects upgrades, so every existing user loses all their notes when they update. New installs are not affected.

## Evidence
- `old_two_notes_saved.png`: v1 with two saved notes after a cold restart
- `new_after_upgrade_notes_lost.png`: v2 after an in-place upgrade showing "No notes yet."
- `upgrade_old_to_new.logcat.txt`: logcat around the upgrade and first launch (790 lines). Nothing is needed from it to support the verdict: the loss is silent, with no crash.
- `new_fresh_install_note_persists.png`: fresh v2 install keeps a note after restart
- Screen dumps: `resumed_activity` was `com.example.notesdemo/.MainActivity` throughout. The notesList text was "• Note 674\n\n• Note 537" before the upgrade and "No notes yet." after it.

Note: there is no text-entry tool, so notes were created by tapping SAVE NOTE with empty input. The app then auto-generates a "Note <n>" entry.

## Tool failures / recoveries
None. Every tool call succeeded on the first attempt.

## Root cause
`NotesStore` in v2 calls `getSharedPreferences("notes_data", ...)` and reads `count` / `note_<i>`. v1 data lives in `notes_store.xml` under the key `all_notes`. Nothing reads or migrates the old file or key, so existing data is silently orphaned. The data is still on disk, so a migration can recover it.

## Suggested fix (tactical): one-time migration in NotesStore
```kotlin
class NotesStore(context: Context) {
    private val prefs = context.getSharedPreferences("notes_data", Context.MODE_PRIVATE)

    init { migrateFromV1(context) }

    private fun migrateFromV1(context: Context) {
        val legacy = context.getSharedPreferences("notes_store", Context.MODE_PRIVATE)
        val blob = legacy.getString("all_notes", null) ?: return
        // LEGACY_DELIMITER must match exactly what v1 NotesStore used in split()/plus()
        val oldNotes = blob.split(LEGACY_DELIMITER).filter { it.isNotBlank() }
        if (oldNotes.isNotEmpty()) {
            val start = prefs.getInt("count", 0)
            val editor = prefs.edit()
            oldNotes.forEachIndexed { i, note -> editor.putString("note_${start + i}", note) }
            editor.putInt("count", start + oldNotes.size)
            if (!editor.commit()) return          // keep legacy data if write failed
        }
        legacy.edit().remove("all_notes").apply() // only after a successful copy
    }
    // ... existing getAll()/add() unchanged
}
```
Use v1's actual delimiter for `LEGACY_DELIMITER` (take it from the v1 source).

## Structural recommendations
- Treat changes to persistence identifiers (prefs file names, keys, DB schema) as schema migrations. Add a versioned `storage_version` key and migration steps.
- Consider moving to Room or DataStore, which have built-in migration support.
- Add an automated upgrade test to CI: install the previous release, seed data, upgrade in place, and assert the data is still there.
