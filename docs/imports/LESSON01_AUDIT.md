# Lesson 01 import audit

Status: prepared on a feature branch for approval. **Not merged or deployed.** The GitHub Pages deployment workflow only publishes main, so this pull request does not update the live app.

Canonical JSON SHA-256: `0e3f18c2432aee39cb23cfe103aca13510fb5e658f492518199b45af54058450`.

## Result and source mapping

All 300 source records are stored unchanged in `src/data/lesson01-import.json`, retaining IDs PSWF-001 through PSWF-300 and every original Vietnamese explanation. There are no structural rejects or duplicate IDs. Five records are quarantined from practice, giving **295 active imported questions**. The old 200-question pool remains archived in `questions.json` and resolvable for existing activity; it no longer fills ordinary new sessions. Four-field word-family recall remains available.

| Source type | Application type | Imported | Active | Held |
| --- | --- | ---: | ---: | ---: |
| identify_word_class | Identify Word Class | 40 | 40 | 0 |
| word_formation | Word Formation | 40 | 40 | 0 |
| fill_in_blank | Fill in the Blank | 40 | 40 | 0 |
| error_detection | Error Detection | 40 | 38 | 2 |
| sentence_correction | Sentence Correction | 40 | 39 | 1 |
| sentence_building | Sentence Building | 40 | 40 | 0 |
| vietnamese_to_english | Vietnamese to English | 30 | 30 | 0 |
| writing_error_recall | Writing Error Recall | 30 | 28 | 2 |
| **Total** | | **300** | **295** | **5** |

Topics remain the source's ten topics. B1/B2 difficulty labels and grammar rule IDs are preserved. The adapter maps a question to an existing lexical family only where a form/hint identifies one; questions without a library family still work through topic/type/difficulty filters and question-level review history. No invented lexical family or blank progress row is inserted. Source metadata remains available in the canonical source file. `build.py` from the ZIP was not executed; the canonical JSON is the import input.

Re-import is deterministic: IDs are validated against the complete 300-ID set and records sorted by ID, independent of source ordering. No writes or append operations against learner data occur during import.

## Held questions

| ID | Reason |
| --- | --- |
| PSWF-122 | “The informations are reliable” combines noun countability and agreement. A natural correction to singular information also needs are → is; this is unsuitable as an unambiguous one-segment task. |
| PSWF-152 | “She entered into the room” can be grammatical. An optional preposition/style change should not be a mandatory detected error. |
| PSWF-192 | Same underlying “entered into the room” issue in sentence correction. |
| PSWF-271 | The reference changes an Australian **work permit** to a **work visa**. These terms cannot be assumed legally equivalent when preserving meaning. |
| PSWF-275 | “She has a basic skill in English” can refer to one skill. Requiring plural “skills” changes its scope and treats a potentially grammatical sentence as an error. |

The held records keep their original IDs, answers and explanations in source and lookup data, but cannot enter sessions, including via a direct question link. They require editorial revision before activation.

## Answer audit and grading

All original references and Vietnamese explanations are retained. Audited additions accept:

- PSWF-041: clearness as well as clarity.
- PSWF-052: inequalities as well as inequality.
- PSWF-055: unfairness is a possible noun reading without further context.
- PSWF-059: automatic as well as automated.
- PSWF-060/061: insignificant / insignificantly are grammatically possible without a positive-size cue.
- PSWF-070: continually as well as continuously; the nuance differs.
- PSWF-080: creation and creations as well as creativity; context permits different noun meanings.
- PSWF-093: effectual as well as effective.
- PSWF-094/096: ineffectively / inefficiently are possible readings without further context.
- PSWF-097: insignificant as well as significant.
- PSWF-101: analytic as well as analytical.
- PSWF-106: unrealistic as well as realistic; the budget is unspecified.
- PSWF-110: simplified as well as simple.
- PSWF-114: confusing can describe people who cause confusion; confused describes their feeling.
- PSWF-176: “He gave me some advice” is another grammatical correction.
- PSWF-289: “I made a good improvement this month” is grammatical. The source explanation's preference for “a significant improvement” is not mandatory; a separate content note explains this without changing the Vietnamese source.

PSWF-072 has insufficient context to exclude all other REAL-family adjectives, so unmatched answers require review. PSWF-038 treats qualified as a state adjective; a different interpretation can be reviewed rather than presented as definitely wrong.

Choice answers are checked against the source options. Single-word reference answers allow case, whitespace and trivial punctuation changes. Explicit British/American analyse/analyze, analysed/analyzed, organise/organize and practise/practice variants are normalized. In a root-to-form task, submitting the unchanged root when it needs transformation is a deterministic error, except an identified ambiguous item (PSWF-072). Other unlisted word forms require review; the app does not guess that a potentially valid derivative is invalid.

For sentence correction, translation, writing recall and sentence building, a normalized reference match is accepted. Other sentences receive **Needs review**, not an automatic failure. Sentence building additionally checks that each token is used exactly once, including duplicate tokens; an objectively missing/extra token is a constraint error, not a grammar judgment. A different valid word order using the tokens still goes to review.

**Limitation:** there is no semantic or grammar evaluation service. “Needs review” may include both valid paraphrases and genuinely incorrect English. It is excluded from accuracy and scheduling until the learner verifies it in Error Bank. This workflow does not certify grammaticality. Explanations are source content and this is an editorial audit, not professional examination validation.

## Rendering, selection and review

- `[[target]]` is rendered as highlighted text without delimiters; roots/hints in parentheses or single brackets remain visible as requested.
- Error Detection renders exactly the source's four segments. Sentence Building renders `meta.tokens` without deduplicating or losing repeated words.
- References, explanations and audit notes are not rendered before submission. Choices and supplied sentence tokens are question material, not leaked answer feedback.
- “All” uses the entire active pool. Selection balances type, topic and difficulty; it also avoids adjacent matching underlying sentence groups where alternatives exist.
- Unseen IDs come first, then due incorrect IDs, then other due completed IDs. Filters are applied before scheduling; a narrow filter cannot promise categories outside that filter.
- Successful question intervals are 1, 3, 7, 14, 30 and 60 days. Incorrect questions are eligible after **one day**, not immediately. Review-only answers await a decision. The schedule starts from review time when an answer is resolved later.
- Unlimited mode exhausts eligible unique IDs, then ends rather than looping the same pool. Session summaries link to the due queue instead of immediately replaying failures.
- Existing word-family recall continues using its separate established family schedule. Question-level schedules are derived deterministically from persisted attempts, without destructive migrations.

## Learner-data safety

The IndexedDB name, existing tables, version and keys are unchanged. No automatic clearing, resetting, renumbering, or rewriting of existing attempts, progress, drafts or schedules occurs. An optional reviewedAt timestamp is added only when resolving a review; old records and version-1 backups remain valid. Source import has no persistence side effects. Archived question IDs continue to resolve in Error Bank, including original reference/explanation data. Question-level review is derived from attempt history and does not replace family records. Practice is disabled until initial history loading finishes, preventing unseen selection against an empty temporary state.

## Verification

- Vitest covers 300 stable IDs, all eight counts, exact explanation preservation, choice membership, token multisets, shuffled-order/idempotent imports, grading and alternate answers, mixed/unseen selection, cooldowns, data preservation and backup compatibility.
- Desktop/mobile Playwright covers practice submission, feedback, reload, history, manual review, duplicate tokens, spacing, all-eight-type sessions, no immediate repeats, and existing four-field recall.
- A separate GitHub Pages production build is checked at `/ielts/` with hash navigation and refresh.
- Manual browser QA checked highlighted targets and hidden feedback, exact Vietnamese explanations after submission, saved alternative translations in Error Bank, alternate sentence order, duplicate “the” tokens, refresh and the empty due queue immediately after a failure.

Final local results: **31 Vitest tests, 16 desktop/mobile learning-flow tests, and 4 production Pages tests passed**. TypeScript and the production build passed. No deployment was performed.
