# Dynamic grammar practice

Initial release: PR #19, deployed with approval on 19 November 2026. A live acceptance check found that ten-item authoring exceeded the original request timeout; the latency update uses bounded single-item requests with a dedicated fast authoring profile. The original 25 authored questions remain unchanged and accessible at `/lessons/01.2/archive` with their previous attempts. `/lessons/01.2` now opens the dynamic builder. English Steps has not been touched.

## Architecture and migration

Previously `GrammarExercise.tsx` loaded `src/data/grammar-b2.json`; `aiAttempts` (Dexie v3) was the only AI practice history. `/api/grammar/grade` looked up those authored IDs before hybrid known-answer/AI grading.

The grading implementation has moved intact to `worker/grading.ts`; its original endpoint/IDs remain supported. The new `worker/sessions.ts` adapter supplies validated generated exercises to the same grader. MCQ grading uses option IDs. Validated references/variants are accepted without a model call. Unknown words and alternative sentences go to the existing semantic grader, not an exact-string rejection. A defensible adjective/adverb contrast has an additional deterministic guard (`statistical` cannot modify `significant`). Provider failures never produce a zero.

Dexie v4 **only adds** `practiceSessions`; existing attempts, progress, lessons, mastery checks, writing and review history are not rewritten. Generated attempts also append to `aiAttempts`. Session snapshots and attempts commit atomically after grading. Backups now use v4 and include generated sessions. Restoring v1–v3 preserves generated-session tables; v4 restores them explicitly. Browser backups contain session access tokens: treat backup files as private. No cloud account or learner identity is introduced.

## Files and responsibilities

- `src/lib/ai/dynamic/topics.ts`: extensible topic registry, format labels and CEFR guidance. Only Word Formation is enabled. Ten topic IDs are prepared; unsupported topics are rejected by the server, not silently substituted.
- `schema.ts`: Zod settings, AI content, private/public question, session and response schemas; even topic/type planning across the entire session.
- `quality.ts`: normalized fingerprints, changed-number/high-overlap duplicate detection, deterministic word-class/slot constraints, MCQ/key/distractor validation and unbiased Fisher–Yates option order.
- `client.ts`: bounded requests, request deduplication, response identity/ordering checks and exam commit.
- `persistence.ts`: validated Dexie writes and atomic attempt recording.
- `src/components/ai/GrammarExercise.tsx`: builder, progressive questions, saved sessions, drafts, navigation, feedback and summaries. `LegacyGrammarExercise.tsx` retains the original authored lesson. Both use the same correction-diff behavior.
- `worker/generation.ts`: real Workers AI generation plus a separate independent audit. No fixed question bank or production test fixtures feed generation.
- `worker/sessions.ts`: Durable Object storage, idempotent batches, private keys, exam gating, retention and generated-question grading.
- `worker/index.ts`: existing CORS, bounded request body, rate limits and route handling.
- `src/lib/db.ts`: additive v4 table/backup migration.
- `generation.test.ts`, `live.test.ts`, `tests/dynamic-grammar.spec.ts`: deterministic tests and opt-in live integration.

## Generation and validation

`POST /api/grammar/generate` initially accepts the requested settings:

```json
{"topics":["word-formation"],"questionCount":20,"difficulty":"B2","exerciseType":"mixed","feedbackMode":"instant","recentQuestions":[],"failedSkills":[]}
```

The final two fields are optional bounded learning context, derived by the browser from recent saved sessions and failed/partial attempts. This creates a random session ID and 256-bit access token, not a question bank. Save the response before requesting a batch.

Subsequent calls to the same endpoint use:

```json
{"sessionId":"UUID","accessToken":"64 lowercase hex characters","batchIndex":0}
```

The plan has ten slots per batch, balancing selected enabled topics and supported formats. Every published question passes runtime checks and independent audit at confidence >= 0.9. Invalid candidates are never exposed and no static fallback is inserted.

New clients request complete ten-question batches without `allowPartial`. The UI collects the entire selected set before showing the exercise workspace. Previously saved partial batches remain compatible; their existing IDs, options, drafts and results are retained while only missing slots are generated. Private rows are checkpointed so transport or malformed-output retries do not discard completed work.

Authoring uses concurrency 2 under a 45-second request budget. There is no semantic quality rejection, confidence threshold or independent AI auditor before publication. Only format parsing is required; grading happens after the learner submits. Gemini handles authoring and grading; see GEMINI_SETUP.md. Sessions retain their seven-day private keys, and exam submission still requires the complete planned set.


Responses contain **public questions only**. Keys, variants, Vietnamese explanations, correct option IDs and distractor explanations remain in server storage until the question has been graded. Tokens are capabilities: another device needs the private backup to resume server grading, and there is no account recovery.

## Grading and exam mode

The existing endpoint also accepts session submissions:

```json
{"sessionId":"UUID","accessToken":"TOKEN","submissions":[{"exerciseId":"UUID","version":1,"userAnswer":"carefully"}]}
```

Maximum 8 per request, model concurrency 2. The client batches exam grading accordingly and saves completed chunks before proceeding, so outages are retryable. Failed calls remain unscored and retain drafts. Pending scores are excluded from the denominator. A separate reveal object is returned only for a non-pending result.

Exam mode first commits **all** answers through `POST /api/grammar/submit-exam` with `sessionId`, `accessToken`, and `answers` keyed by question ID. The server checks that all batches and answers exist, then freezes those answers. Before this commit, `/grade` refuses to reveal a single exam answer. Submitted exam answers cannot be changed through later grading calls. Retry grading continues incomplete/pending evaluations.

Generated question IDs and `generationVersion: 1` are stable. The browser persists settings, public questions, answers, results, reveals, current index, status and the next batch cursor. Refresh never regenerates displayed questions. Starting a new session creates a new server session and retains previous sessions/attempts. The next batch prefetches automatically; errors pause prefetch until explicit Retry Generation. Theory acknowledgements and prerequisite gates are no longer part of the practice workspace.

## Deployment — only after explicit approval

PR #19 applied the initial approved release, including the session storage migration. Further releases must retain the existing migration tag. Do not push/merge casually: this repository has automatic GitHub Pages and Cloudflare branch-preview deployments.

1. Review this branch and run the checks below.
2. The canonical `worker/wrangler.jsonc` adds a `SESSIONS` Durable Object binding, exports `GrammarSessions`, and declares SQLite migration `dynamic-sessions-v1`. It also adds an independent generation rate limiter. Preview bindings are explicit. The root configuration is generated; run `npm run worker:sync-config` after edits.
3. After approval, use the existing Cloudflare account/project and `npm run worker:deploy`. The first authorized deployment applies the new SQLite class migration. Check that the account supports SQLite Durable Objects and its storage/AI quotas. No database ID or new API secret is required for this binding. The existing `AI`, model profile and allowed origin remain in use.
4. Build/deploy GitHub Pages through the existing workflow after the Worker is available. Its public `VITE_GRAMMAR_API_URL` remains the `/api/grammar/grade` URL; sibling generation/exam URLs are derived from it.
5. Verify the approved staging/live flow with the opt-in test and a manual generated session before announcing availability. Configure the staging origin explicitly if different. Do not deploy English Steps.

Server keys expire after 7 days; a Durable Object alarm clears that session's server records. IndexedDB questions, attempts and previously returned feedback remain available afterwards, but expired sessions cannot obtain new batches/grades. No API secrets or raw student answers are logged. Model inference still sends exercise/answer data to the configured Cloudflare AI model as before.

## Checks

```sh
npm test
npm run build
npm run worker:check
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw npm run test:e2e
VITE_ROUTER_MODE=hash PAGES_BASE_PATH=/ielts/ npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw npm run test:pages
```

The live integration is skipped by default and deliberately has no production URL fallback. It creates two sessions and checks stable counts, IDs, all mixed formats and exact-text novelty; use 10, 20 or 50 via `GRAMMAR_LIVE_COUNT`. It costs real inference calls and requires an approved Worker with this feature deployed:

```sh
RUN_LIVE_GENERATION=1 \
GRAMMAR_LIVE_URL=https://APPROVED-STAGING-WORKER/api/grammar/generate \
GRAMMAR_LIVE_ORIGIN=https://APPROVED-ORIGIN \
GRAMMAR_LIVE_COUNT=10 \
npx vitest run src/lib/ai/dynamic/live.test.ts
```

## Limits

Independent model review is a quality gate, not proof of correctness. Word-family membership, naturalness, CEFR level and semantic novelty still rely partly on AI and can be misjudged. Deterministic slot checks cover defensible cases, not all English morphology. A near-duplicate heuristic catches normalized/high-overlap text; it is not an embedding index and cannot promise unlimited uniqueness. Model quota exhaustion, schema errors and strict validation can reject an entire batch; valid earlier batches stay usable. Sessions are per-device, without cloud progress sync. The live integration cannot be truthfully reported as passing until an approved deployment exists. There is no guarantee of grading accuracy on every alternative; existing needs-review handling remains in place.

## Verification performed before approval

- **116 unit tests passed**; one live integration test skipped intentionally. Tests include 10/20/50 generation plans, future multi-topic balancing, all five CEFR prompts, stable/replayed/concurrent batches, independent audit rejection, malformed JSON, timeouts, partial failure/retry, private keys, token/origin/rate/expiry checks, deterministic MCQs and the statistics regression, semantic grading fallback, exam gating/replay, maximum-length exam storage chunks, backups and preserved history.
- **40 Playwright desktop/mobile tests passed**, including the original 25-question archive, complete new instant/exam flows, progressive 50-question loading, partial batch retry, saved drafts/index/results after refresh, new sessions retaining attempts, grading outages and the existing learning/recall/import flows.
- **6 GitHub Pages checks passed** using the hash-router build under `/ielts/`.
- TypeScript/Vite builds and the canonical/default-config Worker dry run passed.
- The actual **local workerd runtime with SQLite Durable Objects** passed session creation, stored-cursor validation, private-token checks, unknown-question rejection and the unchanged original deterministic grading endpoint. This check caught and removed an unsupported scalar export from the Worker entry point; bundling alone did not catch it. These local checks invoked no AI inference and changed no Cloudflare infrastructure.
- Manual browser inspection verified the builder, all selection controls, coming-soon topics and the theory acknowledgement. Local preview screenshot: `/workspace/shared/ielts-dynamic-builder.png`.
- **No live generation claim:** the real model generation/audit pipeline has not been run against a deployed new endpoint. The opt-in live test must run after an approved deployment. Quality/latency/quota behavior with the live model remains a deployment acceptance check.

Additional integration files changed: `src/App.tsx` (new primary and archive routes), `src/components/learning/LearningPath.tsx` (new entry text), `src/index.css` (responsive builder/practice styles), `src/lib/ai/schema.ts` (A1–C1 exercise compatibility), `src/lib/ai/grading.test.ts` (new module imports/backup version), `tests/ai-grammar.spec.ts` (archive regressions), `tests/pages.spec.ts` (new builder routing), `worker/wrangler.jsonc` and generated root `wrangler.jsonc` (reviewable, unapplied storage/rate-limit configuration), and `docs/AI_GRAMMAR.md` (upgrade documentation link). `CorrectionDiff.tsx` is shared by the generated and archived exercise views; `SessionBuilder.tsx` owns the extensible builder controls.

The live validation update rejects unchanged-root cloze questions, canonicalizes redundant accepted-key spellings, and uses an ordinal plus nine booleans for the independent audit response. All nine audit checks and the 0.9 confidence threshold remain mandatory; the compact response reduces inference output rather than removing quality criteria. Safe rejection diagnostics contain only stage, field paths or fixed rule labels, never rejected question text or answer keys.

Authoring model availability and structured-output parameters were checked against the official [Cloudflare Llama 3.1 8B FP8 model documentation](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/). The format contract explicitly requires complete corrected sentences for Error Correction, complete references for transformations/paraphrases, and a single cloze blank for MCQs. Intended error-correction defects and MCQ distractors are not themselves audit failures; the corrected references and unique valid choice must be grammatical.

Authoring uses the provider JSON-object mode with an explicit output schema in the request; every returned item still passes the same strict Zod schema and independent audit before storage or publication. Safe provider classification distinguishes quota, rate, model, format and access errors without exposing provider messages. Quota exhaustion produces a clear recoverable message and preserves saved progress.

The smaller 8B profile is not used in the final deployment: its official model card lists planned retirement on 20 November 2026. The final authoring profile uses [Llama 3.3 70B FP8 Fast](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/) with compact single-item JSON-object requests; independent validation and grading remain GLM.

Each item now has a type-specific system contract and runtime answer-form constraint. Context cues rotate through ten everyday IELTS domains, and already-used roots are passed as avoidance data as authoring proceeds. Unsupported exercise formats are omitted from the per-item context. Sentence tasks must have complete source/reference sentences; semantic and grammatical auditing remains mandatory.

Word Formation roots are required bare strings even for sentence formats. Generation failures aggregate only safe per-slot format/rule diagnostics. MCQ option IDs are reassigned after shuffling and the private answer/distractor mappings are updated together, preventing a model-original answer-ID pattern; existing saved keys are unchanged. Open-ended sentence references remain illustrative: the independent audit does not require an exhaustive list of equivalent sentences, while cloze ambiguity and single-best-answer MCQ checks stay strict.

Sentence-task prompts remove the cloze instruction and their output schema rejects partial sources containing ___; the nine independent checks are unchanged. Verb-target tasks explicitly request a related noun root to prevent base-verb copy answers. Up to three bounded per-item repair attempts share the original 90-second deadline; accepted peers are not regenerated.
