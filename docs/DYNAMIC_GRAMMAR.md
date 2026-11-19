# Dynamic grammar practice

Initial release: PR #19, deployed with approval on 19 November 2026. A live acceptance check found that ten-item authoring exceeded the original request timeout; the latency update uses two parallel five-item requests with a dedicated fast authoring profile. The original 25 authored questions remain unchanged and accessible at `/lessons/01.2/archive` with their previous attempts. `/lessons/01.2` now opens the dynamic builder. English Steps has not been touched.

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

Each batch contains exactly 10 questions. Session-wide planning balances selected enabled topics and supported formats, including across batch boundaries. IDs and ordinals are server assigned. The AI receives CEFR-specific vocabulary/complexity guidance, registry rules/rubrics, a random nonce, recent question text, already-generated questions and weak skills. It must author new content. Runtime validation checks shape, task type, answer class, reference/opening consistency, word-family rotation, duplicates and MCQ constraints. An independent prompt then solves/audits **every** question for grammar, ambiguity, root family, level, accepted alternatives, instruction/answer/explanation consistency, MCQ uniqueness and semantic repetition. All facts must pass at confidence >= 0.9. A failed batch is discarded and regenerated; no failed question is exposed. No fallback static questions are inserted.

There are at most two batch attempts under a shared 90-second budget. Each batch uses two parallel five-item authoring calls (concurrency at most 2; each <=40s), then one independent audit (<=25s), reduced by the remaining budget. Calls settle before retrying. Batches remain sequential per session. `AI_GENERATION_MODEL` uses the fast Llama authoring profile; `AI_MODEL` continues to use GLM for independent auditing and grading. Each model has its own schema style configuration. A Durable Object serializes batch writes; repeated/concurrent requests return the saved batch, including after restarts. A batch is stored before the cursor update, so a recovered request can complete that update without changing already issued questions. Grading can proceed during generation of later batches. Separate client generation limits (12/min) and the existing global limit apply. Input is bounded to 32KB, with a separate 640KB bound for committing all 50 exam answers. Prompts explicitly treat history, answers and generated content as untrusted data.

Responses contain **public questions only**. Keys, variants, Vietnamese explanations, correct option IDs and distractor explanations remain in server storage until the question has been graded. Tokens are capabilities: another device needs the private backup to resume server grading, and there is no account recovery.

## Grading and exam mode

The existing endpoint also accepts session submissions:

```json
{"sessionId":"UUID","accessToken":"TOKEN","submissions":[{"exerciseId":"UUID","version":1,"userAnswer":"carefully"}]}
```

Maximum 8 per request, model concurrency 2. The client batches exam grading accordingly and saves completed chunks before proceeding, so outages are retryable. Failed calls remain unscored and retain drafts. Pending scores are excluded from the denominator. A separate reveal object is returned only for a non-pending result.

Exam mode first commits **all** answers through `POST /api/grammar/submit-exam` with `sessionId`, `accessToken`, and `answers` keyed by question ID. The server checks that all batches and answers exist, then freezes those answers. Before this commit, `/grade` refuses to reveal a single exam answer. Submitted exam answers cannot be changed through later grading calls. Retry grading continues incomplete/pending evaluations.

Generated question IDs and `generationVersion: 1` are stable. The browser persists settings, public questions, answers, results, reveals, current index, status and the next batch cursor. Refresh never regenerates displayed questions. Starting a new session creates a new server session and retains previous sessions/attempts. The next batch prefetches automatically; errors pause prefetch until explicit Retry Generation. The optional advanced-theory acknowledgement does not unlock foundation lessons or add these rules to default Practice Lab.

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

- **111 unit tests passed**; one live integration test skipped intentionally. Tests include 10/20/50 generation plans, future multi-topic balancing, all five CEFR prompts, stable/replayed/concurrent batches, independent audit rejection, malformed JSON, timeouts, partial failure/retry, private keys, token/origin/rate/expiry checks, deterministic MCQs and the statistics regression, semantic grading fallback, exam gating/replay, maximum-length exam storage chunks, backups and preserved history.
- **40 Playwright desktop/mobile tests passed**, including the original 25-question archive, complete new instant/exam flows, progressive 50-question loading, partial batch retry, saved drafts/index/results after refresh, new sessions retaining attempts, grading outages and the existing learning/recall/import flows.
- **6 GitHub Pages checks passed** using the hash-router build under `/ielts/`.
- TypeScript/Vite builds and the canonical/default-config Worker dry run passed.
- The actual **local workerd runtime with SQLite Durable Objects** passed session creation, stored-cursor validation, private-token checks, unknown-question rejection and the unchanged original deterministic grading endpoint. This check caught and removed an unsupported scalar export from the Worker entry point; bundling alone did not catch it. These local checks invoked no AI inference and changed no Cloudflare infrastructure.
- Manual browser inspection verified the builder, all selection controls, coming-soon topics and the theory acknowledgement. Local preview screenshot: `/workspace/shared/ielts-dynamic-builder.png`.
- **No live generation claim:** the real model generation/audit pipeline has not been run against a deployed new endpoint. The opt-in live test must run after an approved deployment. Quality/latency/quota behavior with the live model remains a deployment acceptance check.

Additional integration files changed: `src/App.tsx` (new primary and archive routes), `src/components/learning/LearningPath.tsx` (new entry text), `src/index.css` (responsive builder/practice styles), `src/lib/ai/schema.ts` (A1–C1 exercise compatibility), `src/lib/ai/grading.test.ts` (new module imports/backup version), `tests/ai-grammar.spec.ts` (archive regressions), `tests/pages.spec.ts` (new builder routing), `worker/wrangler.jsonc` and generated root `wrangler.jsonc` (reviewable, unapplied storage/rate-limit configuration), and `docs/AI_GRAMMAR.md` (upgrade documentation link). `CorrectionDiff.tsx` is shared by the generated and archived exercise views; `SessionBuilder.tsx` owns the extensible builder controls.

The live validation update rejects unchanged-root cloze questions, canonicalizes redundant accepted-key spellings, and uses an ordinal plus nine booleans for the independent audit response. All nine audit checks and the 0.9 confidence threshold remain mandatory; the compact response reduces inference output rather than removing quality criteria. Safe rejection diagnostics contain only stage, field paths or fixed rule labels, never rejected question text or answer keys.
