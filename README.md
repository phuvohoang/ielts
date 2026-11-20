# Grammar Studio — IELTS Grammar Mastery

A local-first self-study MVP for IELTS General Training learners moving from an estimated 5.0–5.5 toward an overall 6.5. Built with React, TypeScript, Vite, Tailwind, a shadcn-style button, Dexie/IndexedDB, Zustand, Zod and React Router. Nunito is bundled locally.

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
npm run build
npm run preview
```

## Validate

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Vitest covers preserved content, prerequisite gating, stage progression, mastery checks, grading, deterministic reviews, the database upgrade, and old/new backup compatibility. Playwright runs the learning flow and responsive route checks at desktop and mobile sizes. `npm run lint` checks TypeScript.

## Scope

- Nine navigation sections with a theory-first Learning Path across eight foundation modules. Sentence Foundations has four complete rule-based lessons; seven other modules are explicitly Upcoming outlines. The old 32-lesson outline is retained as historical content metadata.
- Learn → Understand → Guided Practice → Independent Practice → Apply → Review → Mastery Check. Vietnamese theory includes what, why, when, exceptions, annotated examples and typical mistakes. The previous Lesson 01 remains available as a legacy reference.
- 25 lexical families stored separately from learner activity, including arrays for multiple forms, absent forms, root IPA, Vietnamese meaning, examples, collocations and verb patterns.
- 300 imported Lesson 01 records across eight types, with 295 active after audit (78 recognition / 217 production). Five ambiguous records are held for editorial review. Filter by family, type, topic and difficulty; choose 10, 20, 50, 100 or unlimited. The original 200 questions remain archived for existing learner history.
- Deterministic review intervals: 1, 3, 7, 14, 30 and 60 days. Question-bank mistakes return after one day; the separate four-field family recall retains its existing family schedule. Unseen questions are prioritized before completed IDs. Pending review answers do not affect accuracy or scheduling until resolved.
- Writing journal with first draft, revision and self-review checklist. Completing at least 150 words and all three checklist items records a self-reviewed application.
- Lesson mastery requires completed study and application stages, next-day review and at least 80% on a six-question held-back mastery check. Default Practice Lab excludes unlearned rules; Advanced Mixed Practice is an explicit unrestricted option.
- Error Bank, actual activity analytics, local persistence and versioned JSON export/restore.

## Grading policy

Case, whitespace, punctuation and Unicode variants are normalized where appropriate. Sentence-boundary exercises retain punctuation because it is part of the assessed rule. Reference variants include common British/American spelling alternatives. Reference answers and known unchanged-root errors are graded deterministically. Other unlisted word forms and non-matching sentence correction, building, translation and recall answers require review because other correct answers can exist. The learner can confirm a valid alternative or mark it for correction in the Error Bank. Answers and explanations are shown after submission.

Writing feedback is **self-review**, not AI or teacher assessment. The app does not claim to detect all writing errors or estimate an IELTS band. The Writing Errors metric counts unresolved writing-related exercise responses. General Listening, Reading and Speaking modules and automated writing evaluation are upcoming; the daily plan reserves independent practice time for those skills.

## Data and architecture

- `src/data/foundation/`: eight module outlines, complete Vietnamese theory for the first four rule-lessons, and 64 staged exercises.
- `src/lib/learning.ts`: guarded lesson progression, review and mastery-check transactions.
- `src/data/curriculum.json`: retained historical 32-lesson metadata.
- `src/data/lessons.ts`: bilingual Lesson 01 sections.
- `src/data/families.json`: immutable lexical content. IPA is for the root. Empty arrays indicate no common form taught; multiple forms are not interchangeable synonyms.
- `src/data/questions.json`: validated question pool. Stable family and question IDs support expansion beyond 500 families.
- `src/lib/content.ts`: Zod content schemas, normalization, grading and shuffle.
- `src/lib/schedule.ts`: pure scheduling function with an injected timestamp.
- `src/lib/db.ts`: additive version 2 IndexedDB schema, transactional attempt recording and backup restore.
- `src/lib/store.ts`: Zustand view of persisted activity.
- `src/components/ui/button.tsx`: local shadcn-style CVA button primitive.
- `src/App.tsx`: route views and practice interaction.

CEFR levels are study guidance. Lexical examples and Vietnamese explanations are curated seed content; editorial/dictionary review is recommended before a larger educational release. No runtime dictionary or AI service is used. Browser data belongs to that browser profile and origin. Export regularly; clearing site storage removes learning history. There is no account, cloud sync or server-side storage.

## Cloudflare Pages

1. Connect this repository to Cloudflare Pages.
2. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
3. Set Node version to 24. No application secrets or runtime bindings are required.
4. `public/_redirects` serves `index.html` for application routes, supporting direct links and refreshes.

The app is ready for a Pages deployment; this repository change does not deploy a live site.

## GitHub Pages

The primary hosted version is https://phuvohoang.github.io/ielts/.

`.github/workflows/pages.yml` validates, builds and deploys `main` to GitHub Pages using GitHub Actions. Repository Settings → Pages → Source must be **GitHub Actions**. The build sets `PAGES_BASE_PATH=/ielts/` for asset URLs and `VITE_ROUTER_MODE=hash` for routes such as `/ielts/#/practice`, so refreshing any learning screen works on static hosting. Root-hosted local and Cloudflare builds keep browser history routing.

To preview the GitHub Pages build locally:

```sh
PAGES_BASE_PATH=/ielts/ VITE_ROUTER_MODE=hash npm run build
PAGES_BASE_PATH=/ielts/ npm run preview -- --host 0.0.0.0
# Open http://localhost:4173/ielts/
```

Learning progress is stored separately for each origin. To move existing study history from the Sites-hosted app, export a JSON backup in its Settings, then restore it in Settings on GitHub Pages.

## Word-family recall

Open **Word Families → Practise word-family recall** (also available in Practice Lab). Each card shows a Vietnamese meaning and four empty text boxes: noun, adjective, adverb and verb. A root hint is optional. Answers and study forms stay hidden until all four fields are submitted.

The default harder goal requires all forms taught in the library, separated by commas, semicolons or newlines. A lighter goal accepts one known form per class. Enter `none`, `—` or `N/A` when no common form is taught; empty input does not count as recalling an absent form. British/American organize spelling variants are accepted. Unlisted words require verification rather than being automatically rejected; known forms placed in the wrong word class need correction.

Feedback identifies recalled classes and missing forms. Retry missed families from the session summary. Each submitted family is one production attempt with four typed answers; it is saved to existing attempt history, backups, analytics and spaced review without altering existing data. Error Bank links back to the four-field recall mode for retrying these attempts.

## Audited Lesson 01 import

The attached 300-question pack is adapted through `src/lib/importer.ts`; see [the audit report](docs/imports/LESSON01_AUDIT.md) for type counts, five quarantined items and grading limitations. Ordinary sessions use 295 active questions, while all 300 source records and the original 200-question pool remain available for traceability and existing learner history. Importing content never clears IndexedDB.

Practice balances types, topics and B1/B2 levels, prioritizes unseen IDs, and schedules missed questions for the following day instead of replaying them immediately. Unknown English alternatives use **Needs review**. No external grammar service is configured. All source explanations remain unchanged and are shown only after submission.

## Theory-first migration

See [the migration plan and implementation notes](docs/THEORY_FIRST_MIGRATION.md) for the four complete Sentence Foundations lessons, prerequisite gating, data preservation, version-1 backup support and grading limits. New learning progress is stored separately; historical exercise scores do not automatically certify theory completion. The current change is prepared for review and must not deploy before approval.

AI-powered Lesson 01.2 adds 25 advanced typed Word Formation / Sentence Transformation questions and a separate Cloudflare Worker. See [AI grammar architecture, setup, release guide and limitations](docs/AI_GRAMMAR.md). This work does not deploy or modify the English Steps Worker. Free-form AI grading requires an approved configured Worker; service failures remain unscored.

## ReUI developer tooling

See [ReUI setup and activation](docs/REUI_SETUP.md) for the installed project skill, component registry and optional authenticated MCP connection.

The [ReUI practice interface](docs/REUI_UI.md) applies these components to home, exercise configuration, practice navigation and result reports.
