# IELTS Lesson 01 — 300-question import pack

## Contents
- `question_bank_300.json`: canonical source, 300 questions, eight exercise types.
- `question_bank_300.csv`: review/edit format (UTF-8 BOM, `|`-joined answers/options).
- `build.py`: source generator for reproducibility; not required by the website.

## Codex prompt

Import the attached `question_bank_300.json` into the existing `phuvohoang/ielts` app, preserving the current application architecture. Inspect the existing exercise types, grading contracts, content schema and persistence before writing an adapter. Do not assume that these JSON fields are the application's native schema.

1. Map all eight `type` values to the app's exercise types. Keep stable IDs `PSWF-001` through `PSWF-300`; do not generate duplicate IDs or duplicate questions on re-import.
2. For `identify_word_class`, render the `[[...]]` target highlighted; do not display the bracket delimiters. For `error_detection`, use `options` as the four selectable segments. For `sentence_building`, use `meta.tokens` and preserve duplicate tokens.
3. For `word_formation` and `fill_in_blank`, accept capitalization and trivial punctuation variation where appropriate. Preserve the bracketed root/hint as part of the prompt.
4. For `sentence_correction`, `sentence_building`, `vietnamese_to_english`, and `writing_error_recall`, the supplied `answer` is a reference answer, not necessarily the only valid sentence. Support deterministic exact match for straightforward cases, but use an actual semantic/grammar evaluation service or a user-visible 'Needs review' state for other valid variants. NEVER silently mark valid paraphrases wrong just because strings differ.
5. Do not show `answer` or `explanation_vi` until submission. Show the exact relevant explanation afterward, not a generic template.
6. Filter by type, topic, and difficulty. Use all topics and all eight types when the user selects All. Randomize across categories, avoid recently seen IDs when enough unseen questions remain, and use a spaced repetition queue for missed questions.
7. Add automated tests checking 300 unique IDs, eight type counts, correct answer membership for choice questions, no empty explanations, sentence-building token multisets, stable imports, and no premature answer leakage.
8. Before merging, produce an import audit report including counts, mapping, grading behavior, and any content concerns.

## Counts
- Identify Word Class: 40
- Word Formation: 40
- Fill in the Blank: 40
- Error Detection: 40
- Sentence Correction: 40
- Sentence Building: 40
- Vietnamese to English: 30
- Writing Error Recall: 30

## Notes
- This is a carefully authored seed bank, **not a professionally proofread standardized examination**. Have Codex run content checks and flag ambiguous items for human review.
- Several sentence-correction and writing-error questions deliberately cover the same underlying mistake across exercise types. This is spaced skill practice, but should not appear back-to-back.
- Some questions extend beyond narrow word-class identification into verb patterns, uncountable nouns, and collocations because these are closely related to the learner's observed errors.
- The content uses British spelling where relevant (`analyse`, `practise`). Accept American equivalents (`analyze`, `practice`) where grammatically valid.
