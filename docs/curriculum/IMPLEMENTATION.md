# Books & Curriculum: verified vertical slice

## Architecture assessment

The current app is React/Vite, Vietnamese-first, using the installed Radix/ReUI design system. Dexie v6 holds existing lessons, practice sessions, essays, writing patterns, exercises, outcomes and drafts. Cloudflare Worker middleware enforces CORS, bounded JSON requests and generation/grading/global rate limits. GrammarSessions Durable Objects serialize work and keep answer keys private for seven days. Gemini is configured through the existing provider adapter; no browser secret is needed.

The slice adds a separate curriculum route and contracts, not a replacement for existing practice. The source folder supplied by the user contains three PDFs, not a Git checkout. It remains read-only. Work continues on `feat/writing-assessment-review` in the local PR checkout.

## PDF ingestion report

`source-inventory.json` records SHA-256, PDF page number, extracted character count, warnings and extraction status for every page. It contains no source text, exercises, images or answer keys. Run the local-only inventory with Python + pypdf:

```sh
python3 scripts/curriculum/ingest.py /path/to/reference-books --output docs/curriculum/source-inventory.json
python3 -m unittest discover -s scripts/curriculum -p 'test_*.py'
```

| Source | PDF pages | Text extraction | Verification |
| --- | ---: | --- | --- |
| Grammar for IELTS | 272 | No text on all 272 pages | Contents PDF page 5 and Unit 1 PDF pages 14–18 visually inspected; core grammar on PDF 14–16 (printed 1–3) supports the slice |
| Collocations Intermediate | 194 | 193 pages have >=50 characters; page 2 needs visual review/OCR | No lesson promoted to verified |
| Vocabulary for IELTS Advanced | 177 | No text on all 177 pages | Needs local OCR and visual review; no lesson promoted |

Extraction is not verification. Missing files, corrupt documents and page extraction failures are explicitly reported. Scan-only pages are not silently discarded. The Collocations extractor emitted font encoding warnings (fontTools is absent in the supplied Python runtime); per-page warning counts are recorded. Even pages with extracted text remain unverified. No OCR engine has been added in this slice; scanning all three files is supported, but broad source normalization is still gated on OCR/visual review.

The implementation agent read rendered Grammar pages to verify the unit title and concepts. This is not independent human curriculum approval. Unit 1's listening tasks, copied exercises and keys are excluded from production content. No PDF is copied into the repo, served by the app or sent to Gemini.

## Data schemas

`src/lib/curriculum/schema.ts` defines strict Zod contracts, converted to native JSON Schema by the existing Gemini adapter.

- Source: book ID, exact file SHA-256, PDF pages, printed pages, review method/date.
- Shared knowledge: stable ID, unit ID, title, Vietnamese explanation, CEFR, IELTS skills, objectives, independently authored examples, common mistakes, alternatives, sources and verified/draft state.
- Grammar: rule IDs and known aliases. Collocation: combination and incorrect combinations. Vocabulary: headword, part of speech, word family, collocations and IELTS topic. Non-grammar schemas are foundations only; no invented source records are seeded.
- Private candidate: question, format, instructions, tested pattern IDs, difficulty, options, expected answer, accepted alternatives, Vietnamese explanation, rubric and required opening.
- Public question: excludes keys, alternatives, explanation and rubric; contains gate version/method and all eight validation checks.
- Session: random ID/token, verified unit/pattern IDs, expiry and exactly ten public questions. Local run adds answers, results and update timestamp. Per-pattern progress stores counters, due date, intervals and outcome IDs.

Dexie v7 adds only `curriculumRuns` and `curriculumProgress`. JSON backups advance to v7. Restoring v1–6 preserves curriculum data; restoring v7 includes it transactionally. Existing writing/history tables retain their data. Tests cover an actual v6 database upgrade and legacy backup restore.

## UI integration

Books & Curriculum is a new sidebar entry. It uses the existing PracticePanel/Frame composition, Button, NativeSelect, Textarea, Badge, Alert and Skeleton; no theme/font/motion replacement. Browse by book, topic, CEFR, skill or known weak patterns. Unverified books have an actionable empty state. Unit 1 shows objectives, Vietnamese explanations, original examples, common mistakes, source pages, progress and due dates. Generated questions, drafts and results survive refresh; API errors preserve answers.

Known Writing rule aliases link to the verified lesson. Existing acceptance, genuine-error/style separation, deduplication, four review levels and contextual mastery remain intact. Unknown rule IDs are not automatically mapped by a guessed semantic match. The enrol-in-course example awaits a verified collocation record; it is not falsely attributed to Unit 1.

## Generation, validation and grading

`/api/curriculum/generate` accepts only unit/pattern IDs; the server resolves authoritative verified records. Clients cannot provide lesson rules or private rubrics. The ten-slot plan covers MCQ, fill blank, correction, transformation, paraphrase, translation, guided writing and free writing. Word formation/collocation are represented in the schema but not offered for a grammar-only unit.

Before publication:

1. Parse the exact schema and enforce slot identity, target, format and difficulty.
2. Deterministically reject duplicates, unknown/draft targets, no-op rewrites, invalid option structure, wrong opening, changed numbers, answer leaks and the known before-to-within semantic failure.
3. Make a separate examiner call with no authoring conversation or self-approval claims. All eight checks must pass at >=0.9 confidence: grammar, semantics, instruction compatibility, target pattern, alternatives, difficulty, ambiguity and naturalness.
4. Retry rejected slots with new contexts, up to three rounds. Publish only a complete accepted set. Fail safely if the set does not pass; never substitute unvalidated questions.

Private questions are stored individually, with a bounded public session cache. Tokens, session membership and expiry are checked before grading. Exact known answers pass; MCQ options grade deterministically. Other answers go through semantic grading, accepting correct alternatives outside the finite key. Confidence below .8 yields needs_review. Free writing outside 40–80 words or answers avoiding the target cannot advance pattern progress. Replay cannot advance the schedule twice. Correct early practice does not advance the due interval; incorrect answers reset to one day; uncertain results leave scheduling unchanged. Curriculum counters are practice progress, not a claim of mastery; Writing retains its stronger contextual mastery requirements.

## Milestones and limits

1. Complete: inventory all three PDFs; visually verify Unit 1 core grammar; author three normalized records.
2. Complete locally: lesson navigation, ten-question server pipeline, independent quality gate, alternative grading, drafts/review progress, backups and Writing links.
3. Complete locally: curated ten-item original evaluation fixture plus adversarial semantic cases; mocked Worker and browser tests. Fixtures were reviewed by the implementation agent, not a human IELTS specialist.
4. Pending: real Gemini smoke test using existing secure backend credentials, examiner calibration and human approval of the gold set. Automated mocks do not establish live model quality, latency, quota or billing.
5. After that gate: local OCR and section review for the remaining Grammar/Vocabulary pages, Collocations page review, normalized records and gold examples per unit, then expand features/data gradually. Do not mark unreadable sections complete.

No merge, push, secret change or deployment is part of this work. Branch pushes are held because the repository has automatic Cloudflare preview deployments. Build emits the existing large-chunk warning; it is not a failed build.

## Local verification (2026-11-23)

- Unit/Worker suites: 196 passed, 5 skipped (pre-existing opt-in live suites). Includes ten-item fixtures, independent rejection, unseen valid alternatives, token/membership/expiry checks, scheduling replay and v6 migration.
- Python ingestion: 3 passed, including missing file, corrupt document and unreadable page reporting.
- Browser regression: 48 passed across desktop/mobile using installed Google Chrome (the Playwright-managed Chromium binary is absent). Includes Curriculum and existing Grammar/Reading/Listening/Writing flows. Backends are mocked.
- TypeScript/Vite build: passed, with the existing large-chunk advisory.
- Worker config consistency and bundle dry-run: passed; no deploy.
- ReUI C1–C3: passed. C4 clock reads are documented persistence/expiry/due-date exceptions. Desktop/mobile screenshots inspected. No new components installed. The ReUI MCP audit tool is unavailable in this session, so its remote checklist could not run; the installed quality and anti-pattern checklists were reviewed locally.
- Real Gemini quality and independent human review remain pending; broad three-book content expansion is not marked complete.
