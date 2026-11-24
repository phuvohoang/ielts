# Writing assessment and personalized review

## Architecture and rollout

The existing app uses React/Vite, ReUI Frames, Dexie v5 and a Cloudflare Worker/Durable Object proxy. Writing previously returned four scores and at most eight corrections. This implementation first adds validated assessment/error records, then review persistence, then exercise generation/grading and the learner screens. Existing practice routes and legacy results remain supported.

- `src/lib/writing/schema.ts`, `model.ts`, `persistence.ts`: shared Zod contracts, exact source spans, classification, pattern deduplication and transactional updates.
- `worker/writing.ts`: assessment, private exercise rubrics and semantic grading. `worker/index.ts`, `sessions.ts`, `practice.ts`, `grading.ts` integrate existing middleware, storage and Writing submission.
- `src/lib/writing/client.ts`: secure proxy calls, response identity checks, local caching.
- `src/components/writing/*`: existing-essay assessment, issue review/edit/accept/dismiss, pattern merging, four exercise levels and five review views.
- `src/lib/db.ts`: additive v6 migration and backup support. Existing v1–5 data remains intact; restoring an old backup does not clear the new writing tables.
- `src/App.tsx`, `components/practice/SkillPractice.tsx`, `lib/practice/{schema,client}.ts`: navigation and generated-task integration. `index.css` and `components/ui/tabs.tsx`: responsive layout and stock Radix tabs.
- Tests: `src/lib/writing/{writing,worker}.test.ts`, `tests/writing-review.spec.ts`; existing backup/model fixtures updated.

## Data and assessment safeguards

Task 1 uses Task Achievement; Task 2 uses Task Response. Both also estimate Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. These are practice estimates, not official IELTS scores. Overall estimates are withheld below 0.75 model confidence.

The original prompt and essay retain exact whitespace and wording. Issue quotes must match the original occurrence and position. Fabricated quotes, no-op corrections and originals explicitly listed as acceptable are quarantined. Style suggestions and missing task requirements are separate from genuine errors. Low-confidence issues cannot enter the learning bank. Learners may edit corrections/explanations or dismiss errors; original evidence is immutable.

Patterns deduplicate by category plus canonical rule ID (including known aliases), not literal sentence. Explicit merging keeps source essays/evidence and conservatively resets mastery. Future accepted errors for a merged rule follow its destination (including later merges), so they add evidence to the active pattern and reopen mastery when needed. Self-merges and broken/cyclic merge links are rejected without changing evidence. This is not embedding-based semantic deduplication: unfamiliar synonymous IDs may require manual merging. AI can miss errors or misclassify acceptable English; review before accepting. The structured response permits up to 80 issues, not a guarantee of exhaustive detection.

## Review schedule

This is a documented deterministic scheduler, not FSRS. Successful due reviews advance intervals through 1, 3, 7, 14, 30 and 60 days. Incorrect answers reset to one day and clear mastery evidence. Uncertain grading (or confidence below 0.8) leaves the schedule unchanged. Extra early practice is recorded but does not accelerate the schedule or mastery.

Mastery requires three independent context strings at Level 3/4, on at least two different UTC dates, including successful Level 4 free writing. Copied prompts and Level 4 answers outside 40–80 words cannot supply contextual evidence. One exercise records one scheduling outcome; replay does not boost progress. A newly accepted recurring error reopens a mastered pattern. Mastered patterns remain scheduled for later review.

## Backend configuration and privacy

Reuse the existing Worker, Durable Object binding, CORS allowlist and generation/grading/global rate limits. No new binding is required. Store `GEMINI_API_KEY` only as a Cloudflare secret. Optional server variable `GEMINI_WRITING_MODEL` overrides the existing `GEMINI_MODEL`; use a Flash-family model available to the account. No secret belongs in a `VITE_*` variable.

Gemini calls use native `responseMimeType: application/json` and `responseJsonSchema`; Zod validates every request and result. Assessment requests are bounded to 12,000 essay characters and 4,000 prompt characters. Responses and assessment caches are validated; large caches are chunked to respect Durable Object value limits. Model inputs are explicitly untrusted content, not instructions.

Exercise references/rubrics stay server-side until submission. Server caches expire after seven days; saved local essays, feedback and outcomes remain. Expired ungraded exercises must be regenerated. Cached local exercises and drafts survive refresh; assessment/generation/grading require connectivity. Safe errors preserve drafts and do not expose model/key details.

## Manual QA

1. Open Writing → **Chấm bài viết có sẵn**. Submit Task 1 and Task 2 with leading whitespace/newlines. Reload while drafting; verify exact recovery. Compare original and revised text after assessment.
2. Check all four criterion labels, Vietnamese feedback, omissions separately from language errors, and style suggestions separately from the error bank.
3. Edit/accept a real error, dismiss another, inspect its source essay in Writing Review. Accept the same rule from another essay and verify one pattern with both sources. Explicitly merge two patterns and reload.
4. Generate each level. Verify Level 4 exposes no target-rule hint. Refresh mid-answer; the same cached exercise and draft should return. Submit a correct alternative wording and verify semantic feedback, with references available only afterward.
5. Visit Daily Review, My Mistakes, Collocation Bank, Mastered and Progress. Check outcomes and due dates persist. Early practice must not accelerate mastery; uncertain answers must not count as failures. Recurring accepted errors must reopen mastered patterns.
6. Simulate offline/API failure and retry without losing the essay. Check expiry handling. Export/import a v6 backup and restore a legacy backup; existing sessions and new writing history should remain.

Automated browser tests mock the backend and verify desktop/mobile flows, refresh persistence and failure recovery. Worker tests mock model responses and the Gemini HTTP adapter; they do not prove live model quality, account quota or billing. A real Gemini smoke test remains necessary in the deployed environment. This change does not deploy or alter Cloudflare secrets.

## UI verification

Reuses the existing ReUI Frame/Button/NativeSelect/Textarea/Alert/Badge APIs. Added stock Radix Tabs (preview: https://ui.shadcn.com/docs/components/tabs); state selectors use Radix `data-state`/`data-orientation`. No custom entrance motion. Empty/loading/error states and desktop/mobile screenshots checked. C1–C3 passed; C4 clock reads are documented persistence/expiry/due-date exceptions in the relevant files. The remote ReUI audit checklist request returned HTTP 401; the installed quality/anti-pattern checklist was reviewed locally instead. No authentication settings were changed.
