# IELTS AI grammar exercises — implementation and release guide

## Architecture inspection and migration

The IELTS app uses React/TypeScript/Vite, React Router (hash navigation on GitHub Pages), Zustand and Dexie. The pending theory-first branch adds four working Sentence Foundations lessons and learned-rule gating. This feature builds on that branch; it does not merge it or change production. Lesson 01.2 is an explicit advanced opt-in, reachable from Learning Path / Grammar Lessons at `/lessons/01.2`. It does not unlock unstudied rules or confer foundation mastery.

Inspected `phuvohoang/english-steps/worker/index.mjs` and `worker/wrangler.jsonc` through GitHub. Its source declares `POST /grade`, Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, Vietnamese feedback, JSON-schema inference, `ALLOWED_ORIGIN`, an AI binding and a 6/minute global rate limiter. It has no separate application authentication. Its config names the Worker `english-steps-writing`, which differs from the supplied reference hostname. Neither its deployed model availability nor hostname was assumed from these files. No reference Worker was modified, redeployed or sent student answers.

The separate IELTS Worker uses these compatible conventions with server-owned exercises, stricter runtime validation, per-client and global limits, bounded retries/concurrency, timeouts and per-question batch failures. Production AI_MODEL is configured as @cf/meta/llama-3.3-70b-instruct-fp8-fast, verified against Cloudflare’s JSON Mode support list and active-variant deprecation notice on 2026-11-18. Keep it configurable and run the live evaluation checklist in the target account. Sources: https://developers.cloudflare.com/workers-ai/features/json-mode/ and https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/.

## Files

- `src/data/grammar-b2.json`: 25 audited authored exercises: A=8, B=7, C=10.
- `src/lib/ai/schema.ts`: eight exercise types, strict result/scoring contract, known verified variants, summaries and attempt schema.
- `src/lib/ai/content.ts`: shared validated catalogue for client and Worker.
- `src/lib/ai/client.ts`: local verified-answer acceptance, frontend timeout, duplicate-call suppression and endpoint client.
- `src/components/ai/GrammarExercise.tsx`: theory introduction, typed exercise flow, loading/error states, feedback, word diff using the `diff` package, summaries, resume and retries.
- `worker/index.ts`, `worker/wrangler.jsonc`: independent Worker endpoint and bindings.
- `src/lib/db.ts`: additive IndexedDB v3 `aiAttempts`; old attempts, lessons, checks, writing and SRS remain intact. Version 3 backups include new attempts; v1/v2 restores preserve the new table.
- `src/App.tsx`, `src/components/learning/LearningPath.tsx`, `src/index.css`: route, lesson entry and scoped styling.
- `src/lib/ai/grading.test.ts`, `tests/ai-grammar.spec.ts`, `tests/pages.spec.ts`: contract, failure, persistence, desktop/mobile and Pages checks.
- `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `.github/workflows/pages.yml`, `.github/workflows/ci.yml`: dependencies, Worker commands, secret exclusions and public endpoint build variable.

## Exercise and grading contract

The schema supports fill_blank, word_formation, error_correction, sentence_transformation, paraphrasing, sentence_building, guided_writing and mixed. Short forms use an input; longer forms use a textarea. Instructions and source text carry required opening words, building tokens, grammar targets and semantic constraints. A Mixed Grammar Practice toggle interleaves all three parts. The first authored catalogue uses Word Formation and Sentence Transformation/Paraphrasing; it does not pretend to contain eight separate completed courses. Add future authored exercises to the shared server catalogue before enabling them.

Known correct references and reviewed variants are accepted locally; normalization handles Unicode apostrophes, whitespace, case and terminal punctuation. Unknown answers are never rejected by a reference-string comparison, including word formation. They go to AI with source text, instructions, references, variants, rules, skills and rubric. No keyword heuristics award partial credit for free text. AI returns validated correct=1, partially_correct=.5, incorrect=0 or needs_review=null. Low confidence must be unscored. Runtime failures return an error per question, without a grade or recorded incorrect attempt. Pending grades are excluded from the score denominator.

The result includes the original answer, correction, alternatives, Vietnamese feedback/explanation, validated spans and confidence. Displayed rule labels come from the authored catalogue, preventing an invented model label from being shown as an authoritative rule. Explanations still require model evaluation and can be fallible. Word-level insertions/deletions use a maintained diff implementation with semantic `ins`/`del`, visible strike/underline and accessible Removed/Added text.

### HTTP example

`POST /api/grammar/grade` with Origin in the configured allowlist and Content-Type application/json:

```json
{"submissions":[{"exerciseId":"wf-b2-016","version":1,"userAnswer":"The company grew significantly."}]}
```

Returns `{"results":[{"exerciseId":"wf-b2-016","result":{...}}]}`. Each item independently contains either `result` or `error`. Max batch 8, answer 3000 characters, request 32000 bytes measured while streaming; concurrency 2; inference deadline 12 seconds, at most 2 inference attempts per item; client deadline 55 seconds. Malformed JSON, score/status mismatches, wrong exercise/answer identity and invalid/overlapping spans are rejected and retried within that bound. No answer logging. Successful results have a bounded isolate-local cache (200 entries, 5 minutes, SHA-256 exact input/version/model keys); uncertain results and failures are not cached. Exact keys intentionally preserve punctuation and capitalization that may affect grading. Concurrent identical calls share pending work. No cross-browser persistent answer cache.

## Environment and secrets

Worker:

- `AI`: Workers AI binding.
- `AI_MODEL`: the configured model ID with JSON-schema output support; verify availability and response quality when changing it.
- `ALLOWED_ORIGINS`: comma-separated exact origins, production `https://phuvohoang.github.io`; remove localhost for production.
- `GRADE_LIMIT`: Cloudflare rate-limit binding, 12 requests per client IP per minute.
- `GLOBAL_LIMIT`: separate global binding, 60 requests per minute.

Frontend:

- `VITE_GRAMMAR_API_URL`: public complete endpoint URL, e.g. `https://<approved-ielts-worker-host>/api/grammar/grade`. Without it, the client tries the same-origin `/api/grammar/grade`; static Pages returns an unscored service error.
- The Pages build defaults to the owner-provided endpoint https://ielts-grammar-grader.phu-vohoang89.workers.dev/api/grammar/grade. GitHub repository Actions variable `VITE_GRAMMAR_API_URL` can override it.

Deployment credentials: Cloudflare CLI login or server-side `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. They are CLI/CI secrets, never VITE variables, JSON content or checked-in files. The AI binding does not require a client API key. `.dev.vars` files are ignored. No credentials are included in this implementation.

## Local development

```sh
npm ci
cp .env.example .env.local
# In worker/wrangler.jsonc choose a model verified in your own account.
npx wrangler ai models
npm run worker:dev
# A second terminal:
npm run dev
```

`wrangler dev` may use remote Workers AI inference and bill the configured account; it is not an offline model simulator. Configuring/using a paid account requires the owner's authorization. Without an AI binding, known references still work and unknown answers remain unscored with retry controls. Automated tests use controlled model responses, not remote inference.

```sh
npm test
npm run build
npm run test:e2e
PAGES_BASE_PATH=/ielts/ VITE_ROUTER_MODE=hash npm run build
npm run test:pages
npm run worker:check
```

In this managed workspace use `npm_config_cache=/tmp/npm-cache`, `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw`, and for Wrangler `XDG_CONFIG_HOME=/tmp/ielts-config WRANGLER_LOG_PATH=/tmp/ielts-wrangler.log WRANGLER_SEND_METRICS=false` if home directories are unavailable.

## Deployment — only after explicit approval

1. Verify the target Cloudflare account, supported model and budget. Configure AI_MODEL and exact production origins in the separate IELTS config. Keep the English Steps config untouched.
2. Run tests, Worker dry-run and live semantic evaluation against the approved IELTS test endpoint.
3. `npm run worker:deploy` deploys **ielts-grammar-grader**, not English Steps. Record the returned actual URL and verify OPTIONS, known reference, alternate phrasing, partial/incorrect responses, timeouts and limits from the configured origin.
4. Set repository Actions variable VITE_GRAMMAR_API_URL to that actual URL plus `/api/grammar/grade`.
5. Review and merge the theory-first prerequisite and this feature only with approval. Main pushes automatically deploy GitHub Pages. Verify the actual Pages lesson and AI network flow after deployment.

The website was deployed after approval. The owner reports a successful separate Worker build; live AI inference still requires endpoint verification. A successful dry-run proves bundling, not account permission or remote correctness.

## Content audit and grading limitations

All 25 have difficulty, target skills, references, Vietnamese explanation and semantic rubric. Alternatives are provided when context permits, including rapidly/quickly and the that-clause alternative to Object Complement. historic/historical overlap is explicitly taught and accepted where appropriate; archive records can require contextual judgment. Unknown family members go to AI. “Extremely clearly” must retain its strong degree; “clearly” alone is partial. Explicit simple past must not silently become present perfect. “Appeared confident” is evaluated against the authored “seemed very confident during the interview”, not assumed equivalent to “demonstrated confidence”.

AI grading is fallible; strict JSON validates structure, not linguistic truth. The regression tests prove contracts, rubric delivery, handling of controlled partial/incorrect outputs and reviewed reference acceptance. They do not establish live model accuracy. Unseen alternate phrasing, prompt-injection resistance, naturalness and semantic distinctions must be evaluated with the selected live model before release. No auto-generated content is activated.

CORS is a browser origin restriction, not authentication. This self-study endpoint has no user accounts or embedded shared secret. Per-IP/global platform rate limits reduce abuse but are not a hard financial spending cap and can be distributed across locations. Configure Cloudflare account budget controls and, for broader public use, add Turnstile or authenticated per-user quotas. IP limits can affect shared networks. Isolate caches/deduplication are best effort, not global idempotency. Aborted provider work may continue if the binding ignores cancellation. IndexedDB is device/browser-local, so export backups before clearing site data. Student text is sent to Cloudflare only for ambiguous grading; do not submit personal information.

## QA checklist and actual verification

Automated: unit/Worker contract tests; desktop/mobile complete all 25; answers hidden before submission; original answer visible afterwards; partial feedback and accessible diff using a stub endpoint; failure retry without a recorded zero; persistence/retry history; prior bank and complete four-lesson theory flow; Pages hash deep-link/refresh; Worker dry-run.

Manual local browser checked: advanced theory gate, empty input disabled, first question references hidden, correct answer feedback/explanation, next question, unlisted answer service failure kept the input visible and unscored. No live AI inference or production QA was performed.

Before production: run the ten semantic regression examples with the selected model and the actual source/instructions (especially the interview context and There was instruction); check confidence/uncertain outputs; test prompt injection as student data; verify Vietnamese feedback with an English teacher; test keyboard/screen reader on target devices; verify rate limits/CORS on Cloudflare and export/import a real browser backup.

Local verification results: 64 unit/Worker tests passed; the complete 30-case desktop/mobile suite passed before the final mixed-order addition, followed by the focused 8-case AI lesson suite (including mixed mode); 6 Pages preview tests passed; TypeScript/production builds and Worker dry-run passed. These are local results; GitHub CI and live model evaluation are separate checks.
