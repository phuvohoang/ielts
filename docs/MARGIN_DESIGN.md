# Margin Finance visual adaptation

Reference selected by the user: https://margin-finance.reui.io/

The public reference was inspected visually and through rendered DOM measurements. The implementation uses official free ReUI/shadcn Radix Vega primitives and the app's own JSX and learner data. No premium template source, finance demo content, account identity or licensed assets were downloaded into the app.

## Reference characteristics carried over

- Inter typography replaces Nunito, as authorized by the selected reference. Fonts are bundled locally through @fontsource/inter.
- Floating Sidebar with its own white rounded surface on a muted canvas. The reference's sidebar measures about 255px; the standard Sidebar width is 16rem.
- An inset application surface with an 8px canvas gutter, a 48px breadcrumb header and an independently scrolling main region.
- ReUI Frame title bands, white panels and footer rows. Frames use the documented radius variable with `--radius-lg`, matching the reference's approximately 10px radius. Stock spacing props own panel insets.
- Compact 14px text, 12px metadata, 24px summary figures, neutral borders and standard-sized controls. No application-level CSS overrides Input/Select/Button heights or panel padding.
- Sidebar collapsed-icon mode on desktop and the stock Sheet on mobile, including focus containment and Escape handling.

The content is adapted for IELTS: skill launchers, real saved-work history and real completion counts replace financial metrics. Empty histories show an action rather than fabricated activity. The page geometry follows the reference; content and widgets intentionally serve learning rather than finance.

## Components and previews

- [Frame](https://reui.io/components/frame?ref=mcp)
- [Basic Frame example](https://reui.io/preview/radix/components/c-frame-1?ref=mcp)
- [Sidebar](https://reui.io/components/sidebar?ref=mcp)
- [Button](https://reui.io/components/button?ref=mcp)
- [Input](https://reui.io/components/input?ref=mcp)
- [Skeleton](https://reui.io/components/skeleton?ref=mcp)
- Sidebar dependencies: stock Sheet, Tooltip and Separator.

The stock shadcn registry style is now Radix Vega, matching @reui. Existing custom Button CSS has been replaced with the installed Button API. The legacy stylesheet and practice-ui.css patches are removed; src/index.css now contains semantic tokens and scoped application layout only.

## Integration corrections

The installed Sidebar uses presence selectors for active rows. False `data-active` attributes are omitted so only the current route is highlighted. The installed Sheet's animation selectors are adapted to Radix's actual `data-state` attribute. These are functional compatibility fixes rather than visual restyling of the primitives.

Tooltips are passed only in desktop collapsed mode. Hidden TooltipContent in the original composition could otherwise still intercept Escape inside the mobile Sheet. Mobile regression verifies one Escape closes the Sheet and a navigation selection dismisses it.

The original backup restore confirmation remains unchanged to preserve its data replacement warning. No schema migration, reset, question-bank change or AI contract change is introduced.

## Verification

- TypeScript lint and production build.
- Unit suite and full desktop/mobile practice suite.
- Sidebar collapse, active-route indicator, mobile focus trap, Escape, navigation dismissal, Inter font and internal horizontal overflow regression checks.
- Setup Input/Select height and alignment regression checks retained.
- Screenshots inspected for home, setup, question workspace, results and mobile shell.
- Pages subpath and hash-router checks.
- ReUI MCP audit checklist retrieved; C1–C4 self-checks run on application files. Existing Date.now() calls remain only for persistence and expiry, documented at the top of GrammarExercise and SkillPractice.
- No added page entrance animation. Existing component animations honor reduced motion. No paid generation or grading calls are needed for these UI tests.
