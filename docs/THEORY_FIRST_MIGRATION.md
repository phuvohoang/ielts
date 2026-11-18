# Theory-first learning migration

Prepared on a feature branch for approval. Do not merge or publish until approved: main automatically deploys to GitHub Pages.

## Existing architecture and migration plan

The application previously selected exercises directly from a validated bank and derived activity and family reviews from Dexie attempts. It did not store theory completion, and imported rule IDs described broad exercise categories. Exercise accuracy could therefore be mistaken for lesson mastery without evidence that the learner had studied a rule.

The implemented migration follows four additive steps:

1. Keep existing question IDs, source explanations, attempts, family schedules, writing drafts and review history. Add version-2 `lessons` and `checks` tables without clearing or rewriting the version-1 tables.
2. Add `grammar_rule_ids` and `prerequisite_lesson_ids`. Default practice fails closed unless every referenced rule has available theory and the learner has acknowledged Learn and Understand. Advanced Mixed Practice explicitly bypasses that filter, with a warning. Quarantined items and held-back mastery questions remain excluded even in Advanced mode.
3. Activate only the complete Sentence Foundations module. Future modules have small rule-lesson outlines, marked Upcoming; no empty theory lesson or empty mastery check is active.
4. Test the complete seven-stage flow, migration of a populated version-1 database, old/new backup compatibility, gated default practice, free-text review and held-back mastery scoring on desktop/mobile.

## Curriculum scope

The eight module outlines are Sentence Foundations, Parts of Speech, Nouns & Articles, Adjectives & Adverbs, Word Formation & Word Families, Verb Patterns, Tenses & Verb Forms, and Complex Sentences.

Only these four first-module lessons are implemented:

| Rule/lesson ID | Rule |
| --- | --- |
| sf-complete-clause | A standalone declarative clause needs a subject and finite verb phrase |
| sf-svo-order | Neutral active statements place subject, verb and object in that order |
| sf-be-complement | Be links a subject to a state, role or location complement |
| sf-sentence-boundary | Distinguish standalone statements, dependent fragments and joined independent clauses |

Each lesson contains Vietnamese explanations of what, why, when, exceptions and mistakes; three English examples with Vietnamese translations and structural annotations; three incorrect/correct comparisons; and specific feedback for each authored question. The first module adds 64 stable questions: 12 guided, 12 independent, eight application, eight review, and 24 held-back mastery items. Content is authored teaching material, not a claim of external examination certification.

The old 300-record import (295 non-quarantined questions), original 200-question archive, 25 lexical families and four-field family recall remain intact. Imported bank questions are conservatively linked to the specific future rules they need; they stay in Advanced mode while those theory lessons are unavailable. Existing imported explanation text is unchanged. The earlier Lesson 01 reference remains under `/lessons/legacy`; it does not silently mark new theory lessons learned.

## Progression and status

1. **Learn:** read the detailed Vietnamese rule and acknowledge studying it.
2. **Understand:** study annotated examples and mistake comparisons, then acknowledge understanding.
3. **Guided Practice:** focused questions show the relevant rule hint.
4. **Independent Practice:** no hint is rendered before submission.
5. **Apply:** sentence writing and error correction; drafts are also saved to the existing writing journal. Alternative sentences require explicit review against the rule, not string-based rejection.
6. **Review:** available one day after application. An incorrect review schedules the next cycle for the following day. Learners can study other prerequisite-ready lessons while waiting.
7. **Mastery Check:** six held-back questions, with at least two from the current rule and representation from previously reviewed study cycles when available. No hints. A question is submitted only once within a check; revisiting feedback cannot overwrite a wrong response. All six must be answered, pending reviews resolved, and accuracy must reach 80% before mastery is awarded. Failed checks require a new due review before a later check. Passed check history is retained when a learner revisits a mastered lesson.

Each focused exercise stage requires all its authored tasks to have a correct latest response. Guided-stage retries are deliberate revisits after studying feedback; normal Practice Lab still uses its existing unseen-first, non-immediate spaced queue. Generic/Advanced attempts do not complete lesson stages or award mastery. Learners may revisit already reached theory, examples and practice at any time. On refresh, incomplete lesson stages resume at the first task without a correct response.

A prerequisite lesson's Learn + Understand completion permits studying the next theory lesson; mastery is not required just to read the next prerequisite-ready rule. This lets learners continue studying while next-day reviews wait. States shown on Learning Path are Not Started, Learning, Practicing, Reviewing and Mastered, derived from real saved progress. Old exercise scores are not converted to theory acknowledgements or mastery.

## Persistence and compatibility

- IndexedDB name and existing table primary keys remain unchanged. Dexie version 2 adds `lessons: id, reviewDueAt` and `checks: id, lessonId, startedAt`.
- Existing attempts gain optional lessonId, learningStage and checkId only for new learning activity. Historical records need no rewrite.
- Version-2 JSON exports include the two new tables and validate ordered stage prefixes and a passed check for any mastered lesson. Version-1 backups still restore attempts/family progress/writing while preserving new lesson/check tables absent from those old backups.
- Restoration remains an explicitly confirmed Settings operation. A database upgrade or content import never automatically clears user data.
- There is no account or cloud sync. The same-origin GitHub Pages update retains local IndexedDB history. As with any IndexedDB app, a browser with version 1 of the app already open may need that old tab refreshed after a schema upgrade.

## Grading limits

Reference matches and known choice errors are deterministic. In sentence-boundary tasks, punctuation is part of the actual rule and is not stripped away before judging a missing boundary or comma splice. Other grammatically valid free-text alternatives go to Needs review. Learners explicitly check structure, meaning and boundaries before confirming an alternative; no semantic grammar service or teacher-grade certification is claimed. Pending responses do not count as a passed mastery check.

Future-bank rule links use conservative content metadata mapping. These links help explain Advanced-mode errors but do not activate those future lessons. Expansion requires authored theory, prerequisite review, focused practice, applications and held-back checks for each additional rule.

## Verification and preview

```sh
npm ci
npm test
npm run test:e2e
PAGES_BASE_PATH=/ielts/ VITE_ROUTER_MODE=hash npm run build
npm run test:pages
```

The end-to-end tests complete all four lessons through all seven stages on desktop and mobile, advancing only the isolated browser test clock to check next-day review. Production has no clock bypass. Tests also cover prerequisite blocking, explicit Advanced opt-in, wrong-answer feedback, hidden independent hints, failed/incomplete mastery checks, concurrency, refresh persistence, a populated v1→v2 upgrade and backup restoration.

For local preview, run `npm run dev`, open `/path`, and start Sentence Foundations. For the built GitHub Pages preview, use `PAGES_BASE_PATH=/ielts/ npm run preview` and open `/ielts/#/path`.

Final local results: **45 Vitest tests, 24 desktop/mobile end-to-end tests, and four GitHub Pages production-preview tests passed**. The full seven-stage path for all four lessons was exercised on both viewport sizes. A subsequent focused rerun also passed after adding the one-submission-per-check safeguard. Manual browser QA confirmed Vietnamese theory, annotated examples, locked future stages, guided hints, and specific violated-rule feedback. TypeScript and the production build passed. No live deployment was performed.
