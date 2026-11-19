# Comprehensive grammar practice

This extends the existing React/Dexie/Zustand application and Gemini Worker. No
new database, paid service, framework or theory screen is introduced.

## Configuration and generation

The default configuration is All Grammar Types, All Topics, B2, 20 questions and
Mixed formats. The registry defines 20 grammar categories with specific authoring
and grading guidance and optional subtopic selections. Existing topic IDs remain
valid. IELTS context is separate from grammar selection: 14 IELTS contexts rotate
under All Topics, or the selected context is applied to every planned question.
A2–C1 guides specify structural complexity, contextual clues and distractor quality.
All filters out categories above the selected level; subtopic options are also
level-specific. For example A2 conditionals stay zero/first, while C1 defaults to
mixed time relations and nuanced aspect rather than merely longer vocabulary.
A1 remains readable for saved sessions, but is not offered for new practice.

A server-authored plan balances grammar categories and suitable formats over the
entire 10/20/50-question session. Format selection is restricted to those supported
by selected categories. At least four suitable formats are used in mixed sessions;
word-family work is not imposed on other categories. The legacy Paraphrasing format
remains available alongside the eight requested formats.

The existing schema contract is reused rather than duplicating fields: `id` is the
question ID, `topicId` is grammar category, `grammarSubtopic`, `ieltsTopic`,
`difficulty`, `exerciseType` is exercise format, `instruction`, `questionText`,
`options`, `referenceAnswers`, `acceptedVariants`, `explanationVi` and
`gradingCriteria`. Private keys, targetWord and grading criteria are omitted from
public exercise responses. References/explanations are revealed after grading.

Generation remains in checkpointed batches of ten using bounded per-question
requests. Strict native schemas and deterministic checks cover complete fields,
choice structure/unique keys, single gaps, duplicate sources and no-op rewrites.
Only failed slots are retried. The full selected set is collected before practice
opens; valid questions/IDs survive failed retries. No second AI audit is introduced.

Reordering derives tokens from the private reference, shuffles them once before
checkpointing and publishes only the shuffled sequence. Tokens can be clicked into
the answer, or the full sentence can be entered/edited. Meaning Comparison uses
four interpretations and the existing choice UI/grading path.

## Grading and results

Open-ended answers continue to receive semantic AI grading. Dynamic tasks request
specific Vietnamese feedback on the learner phrase, actual rule and context,
including tense/aspect, stative senses, participant preservation and word-family
requirements. Facts/criteria still determine scores; valid alternate wording is
not rejected for failing an exact-string lookup. Existing curated legacy exercises
retain their reviewed explanations. Ambiguity/uncertainty is unscored.

Results report scored percentage, correct/partial/incorrect/unanswered/ungraded/
review counts, category and format breakdowns, detailed corrections and suggestions.
Reference keys for unanswered or ungraded questions are not displayed. Review
Mistakes navigates the existing questions. Retry Incorrect Questions selects only
incorrect or unanswered IDs, snapshots prior answers/results/reveals, and preserves
other work and the existing aiAttempts history. Exam retakes require the original
complete submission and cannot mutate its frozen answers or reveal early keys.

## Persistence and compatibility

No IndexedDB version bump or clearing migration is needed: category/context fields
and local retake snapshots are optional additions to the existing session schema.
Old sessions and backups remain readable. Retake state and prior-round snapshots
are included in the existing v5 backups. Expired server capabilities still prevent
fresh grading after seven days; saved local feedback remains accessible.

## Validation and limitations

Tests cover configuration, selected-category/context planning, exact 10/20/50
counts, diverse formats, root/privacy/no-op guards, malformed choices, stable
reordering, semantic grading, stative feedback, exam freeze/retake access, results
aggregation, backups and browser navigation/reload on desktop/mobile. Live provider
checks verify actual generated content and post-submission feedback before release.

AI-authored difficulty and explanations are practice guidance, not official IELTS
certification. Local storage does not sync devices; use the existing backup export.
Provider outages retain work and expose retry rather than silently shortening sets.
