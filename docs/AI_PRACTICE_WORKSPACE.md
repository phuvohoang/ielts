# Practice-only IELTS General workspace

The public application has four skills: Listening, General Reading, General
Writing and Grammar. There are no theory lessons, learning prerequisites or
mastery unlocks. Historical lesson/word-family/static-practice URLs redirect to
Grammar; old error/progress links redirect to history. Unused theory content is
not imported by the application. Old schemas and stored history remain compatible.

Grammar generates the selected 10, 20 or 50 questions in saved ten-question batches,
then opens the exercise workspace only after the complete set is ready. It has ten
configured grammar topic profiles. `AI_PRACTICE_ONLY=true` forces provider grading
for known answers and MCQs as well as unfamiliar free text. The historical grading
API stays compatible for saved data. No new static question bank is activated.

## Listening, Reading and Writing

`POST /api/practice/generate` accepts skill, CEFR level, task1/task2, optional focus
and bounded recent titles. A new random Durable Object owns private keys and a
seven-day capability token. Structured Gemini generation is published after format parsing, with one retry for
malformed output. There is no separate AI audit, semantic approval score, source
evidence gate or answer-quality repair loop before the learner can practise. Reading and Listening provide five questions per
short practice set, not a full official IELTS paper.

Public responses strip answers, evidence, explanations and the listening transcript.
`POST /api/practice/grade` requires all answers, freezes the submitted content,
uses Gemini to assess alternate English and returns feedback/keys only afterward.
Identical requests reuse the saved result. Uncertain comprehension judgments are
excluded from the scored denominator. A short-set score is not converted to an
IELTS band. Writing has separate Task Achievement/Response, Coherence/Cohesion,
Lexical Resource and Grammar feedback; the averaged half-band is clearly a practice
estimate. Corrections with invented source quotes are filtered out.

`POST /api/practice/audio` is capability-protected. The Gemini Interactions API
uses `gemini-3.8-flash-lite-tts` and a standard Kore voice to read the generated
single-speaker script verbatim as WAV. No voice cloning or browser speech synthesis
is used. Audio is checked for RIFF/WAVE headers and stored in 64KB Durable Object
chunks; replays do not regenerate it. Provider errors retain the exercise and
expose an explicit retry. The transcript stays private until submission.

Provider speech documentation: https://aistudio.google.com/docs/speech-generation
The existing server-only GEMINI_API_KEY is reused; GEMINI_TTS_MODEL selects speech.
Audio and text API usage are billed by Google separately. No credential enters
frontend source or VITE configuration. Existing origin/rate limits also protect
the three practice endpoints.

## Persistence and deployment

Dexie v5 adds `practiceRuns` and `practiceAudio`, without clearing earlier tables.
Version 5 JSON backups include drafts and feedback; audio Blobs are cached on the
current device and excluded from JSON backups. Restoring a v1–v4 backup does not
remove new skill-practice records. V5 restores replace their practice records too.
Clearing browser storage still requires a backup to recover learner work.

API must be deployed before or together with the new frontend. Existing Worker
secret and Durable Object binding are reused; no new account or service is needed.
A functioning Gemini TTS entitlement/rate limit must be verified with real audio,
not just a model-list request. Generation/grading quality remains model-dependent;
no claim of official examiner certification or guaranteed perfect answers is made.

Run unit tests, build, worker dry run, desktop/mobile browser tests and Pages tests.
Before publishing verify live audio playback, reading submission, a writing task
and grammar grading with AI. Synthetic fixtures are confined to test-support files.

## Sentence-task constraints

Sentence-task sources may not contain embedded task templates, labelled solutions
or complete accepted answers. Opening phrases are public task constraints and are
shown before submission, and a phrase equal to a complete key is suppressed in public responses. Older local drafts without
this newly public field remain readable; the client allows adding it during a
partial-batch repair without changing existing question IDs or results.

## No-op rewrite prevention

Word-formation rewrites include a private targetWord field (never sent to the
browser). A narrow deterministic guard rejects unchanged source/reference pairs,
copied accepted variants, a requested target word already present in the source,
target metadata missing from the reference. Comparison
ignores case, punctuation and underline presentation while preserving actual words
and numbers. Only the failed ordinal is retried within the existing bounded
authoring budget; other question IDs and keys remain checkpointed. This does not
restore the removed independent AI auditor or general quality scoring pipeline.

Older cached tasks remain readable and are not regenerated or regraded. This fix
acts during authoring only; grading behaviour is unchanged.
