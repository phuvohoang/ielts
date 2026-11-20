# ReUI practice interface

The exercise interface now uses actual installed ReUI components rather than developer tooling alone. Home skill links, setup, question workspace and score reports share a Card composition; ReUI Badge communicates states, Alert presents service errors and Skeleton fills generation/loading regions.

## Learner-facing changes

- Home offers four accessible skill links inside Cards, with clear descriptions and start actions.
- Grammar configuration separates grammar scope from difficulty/context/format. The summary and generate action stay together.
- After generation, the question and answer field remain the primary workspace. Saved sessions remain collapsed below the exercise.
- The question panel retains answered/unanswered indicators and adds **Câu chưa làm tiếp theo**. The last question still has no Next button. Mobile moves the question panel above the exercise.
- Results lead with score and completion counts, then responsive category/format breakdowns. Details and previous rounds remain available without a wide table.
- Listening, reading and writing use the same Card, select, loading and feedback vocabulary. Reading passage, listening audio and writing draft retain their existing behavior.

## Installed sources

All components are free. The official Radix APIs and layout guidance were retrieved through the authenticated ReUI MCP.

- [Badge](https://reui.io/components/badge?ref=mcp)
- [Alert](https://reui.io/components/alert?ref=mcp)
- [Card](https://reui.io/components/card?ref=mcp)
- [Skeleton](https://reui.io/components/skeleton?ref=mcp)
- [Native Select](https://reui.io/components/native-select?ref=mcp)
- [Worked badge example](https://reui.io/preview/radix/components/c-badge-1?ref=mcp), installed for reference; app statuses use the documented light/outline variants.

Card and Skeleton use the project's existing shadcn new-york registry. Badge and Alert use pinned ReUI Radix Vega. Native Select is absent from the old new-york registry, so its official shadcn Radix Vega registry URL was used. No existing Button was overwritten or assigned unsupported props.

`practice-ui.css` maps semantic tokens to the neutral white/black palette and scopes layouts to practice screens. Legacy select styling excludes the installed NativeSelect so component padding stays intact. Default border colors come from the semantic border token. The site retains its existing light theme; adding a user-selectable dark theme is outside this change.

## Data and API preservation

No schema/database migration, reset or exercise content change is introduced. Existing sessions, drafts, attempts, score history, server expiry checks, answer hiding and AI request contracts are preserved. OAuth credentials remain outside the repository. No paid model calls are needed to verify this UI change; browser tests use the existing API fixtures and audio fixture.

## Validation and ReUI audit

- 170 unit tests passed; 5 live-provider tests skipped without credentials.
- Full browser suite: 34 passed across 1440px desktop and 390px mobile.
- Pages hash-router/subpath checks: 2 passed.
- Production build and TypeScript lint passed.
- Inspected browser screenshots for configuration, exercise/navigation, results, reading and home.
- ReUI MCP audit checklist retrieved; API contracts and installed source read before use.
- C1–C3 self-checks clean. C4 retains original `Date.now()` calls in GrammarExercise and SkillPractice for persistence timestamps and server expiry, documented at the top of each file. They are not render keys or animation.
- No new entrance motion. Existing smooth scrolling, skeleton pulse and button hover respect reduced-motion preferences.

The app-specific composition adapts free primitives instead of installing a premium page template. Native HTML details, progress, checkbox and radio semantics remain; no custom modal or tab implementation was added. No raw result table remains on the changed results screen.

## Neutral theme and aligned setup controls

Follow-up: setup topic fields now use the official shadcn Radix Vega Input, matching NativeSelect's default 36px height. Legacy input geometry and focus outlines exclude installed component slots. Both controls retain their own registry styles. Input preview: https://reui.io/components/input?ref=mcp

The user requested white/black rather than the previous forest palette. The shared neutral theme now paints both installed components and legacy shell surfaces through semantic tokens. Statuses still carry text/symbols, so answered, unanswered and errors remain identifiable without color. Nunito, data and API behavior are unchanged. Browser regression checks measure actual control heights/alignment across listening, reading and writing at desktop and mobile widths.
