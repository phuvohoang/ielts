# Word Families

Route: `/word-families` (HashRouter on GitHub Pages). Empty by default: no sample vocabulary is installed in production.

## Library

JSON is an array of records with `meaning_vi` and arrays `noun`, `adjective`, `adverb`, `verb`. Omitted forms default to empty arrays; empty arrays never generate a substitute. At least one form and a non-empty meaning are required. Multiple alternatives are stored explicitly. UI forms and CSV use `|` between alternatives. CSV supports BOM, quoted commas, escaped quotes and multiline meanings. Templates contain no vocabulary.

Files are limited to 2 MB and 5,000 records per import. Every record is validated before confirmation; any invalid row blocks the import. The preview flags exact normalised Vietnamese-meaning matches or identical normalised sets of all English forms, including duplicates within the file. It does not infer semantic duplicates or merge conflicting entries. Confirmation rechecks duplicates inside the database transaction so concurrent changes cannot silently overwrite a family. Library export contains all current rows, not only search results. English form alternatives are case/whitespace-normalised for duplicate detection and grading, not fuzzy-matched.

## Practice

No fetch, Gemini or backend service is used. Fisher–Yates sampling uses browser crypto randomness, selects unique family IDs, and shuffles the four field positions separately for every question. Missing forms are omitted and unscored. A request larger than the selected pool uses that whole pool with a notice. All supports the full selected pool.

Each session stores an immutable copy of its imported families, field order, original answers, checked flags and current question. Thus later library edits/deletions do not rewrite earlier feedback. New/retry sessions select current library entries only. Check awards one point per explicitly accepted form after lowercasing, trimming and collapsing whitespace. Spelling errors and unlisted UK/US variants remain incorrect. Results report scored forms, overall/part-of-speech accuracy, fully correct families, and corrections retaining original answers.

Weaknesses track the latest checked state per family/form. Correct subsequent attempts clear that form. Checks against obsolete edited keys cannot update that form's current weakness; deleted families are not added back. Retry Incorrect Words uses erroneous families from the displayed session, intersected with the current library. Practice Again repeats the same available families with a fresh random order. Sessions retain drafts when changing tabs or refreshing; history is paginated.

## Storage and compatibility

Existing Dexie database, additive version 7: `wordFamilies`, `wordFamilyRuns`, `wordFamilyWeaknesses`. Shared backup export v7 includes all three tables. Restoring older backups preserves these new tables; legacy v1–6 application data remains supported. Storage is local to the browser/origin, consistent with existing app data. Existing PDF sources are untouched.

## UI and verification

Uses existing Frame, Tabs, Button, Input, NativeSelect, Badge and Alert. Added stock Radix/shadcn [Table](https://ui.shadcn.com/docs/components/table), [AlertDialog](https://ui.shadcn.com/docs/components/alert-dialog), [Progress](https://ui.shadcn.com/docs/components/progress). ReUI MCP is not available in this session; a stock Table with contained horizontal scrolling is used instead of DataGrid to avoid adding another table engine for five fixed columns. No theme or unrelated screen changes. Progress forwards its value to Radix for accessible numeric progress.

Unit coverage includes CSV/JSON validation and roundtrip, duplicates, CRUD, randomness, alternatives and spelling, missing forms, scoring, drafts, weaknesses, changed/deleted keys, backup restore, and actual v6→v7 upgrade. Browser coverage runs desktop/mobile import preview, CRUD/export, bad imports, CSV alternatives, shuffled field entry, no early answers, missing fields, tab/reload persistence, keyboard focus/Enter, results and retries. Tests abort any `/api/` request and assert zero calls from this feature. Whole-app regression and production-build checks are also run.
