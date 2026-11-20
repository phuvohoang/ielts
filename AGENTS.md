# IELTS project instructions

## Preserve the existing app

- Keep Inter (matching the user-selected Margin Finance reference), the neutral white/black palette, Vietnamese learner flows and responsive layout unless the user requests a redesign.
- Preserve practice sessions, drafts, results, review history, AI routes and server-side answer/key privacy.
- ReUI is installed as development tooling. Existing components are not automatically ReUI components: read their actual API before changing them. The installed Button uses the Radix Vega size/variant API.
- Prefer incremental, requested UI changes. Do not replace the app shell, run shadcn init, overwrite components, or inject a new global theme merely to install tooling.
- Compatibility rules above take priority over vendor defaults below when preserving existing code. User requirements take priority over both.

## ReUI integration

- Read `.agents/skills/reui/SKILL.md` for relevant UI work. The official bundle is pinned in its SOURCE.json.
- Stock shadcn and the @reui registry both use **Radix Vega**. ReUI MCP uses the same style query. Read Radix APIs, not Base UI APIs.
- Use free components/examples unless the user explicitly authorizes premium assets. Never commit a license/token or put one in a VITE variable.
- Use the central semantic tokens in src/index.css. Do not reintroduce legacy CSS, a Nunito font override, or per-component height/padding overrides. Practice surfaces use ReUI Frame; the floating Sidebar and inset content shell match Margin Finance.
- MCP configuration is project-scoped in `.codex/config.toml`; authentication/restart is separate. Installing or updating the skill must not modify global Codex or unrelated agent configurations without an explicit request.

<!-- BEGIN:reui-agent-rules -->
## ReUI design rules (every UI edit, follow-ups included)

This project uses an existing design system: ReUI on shadcn/ui. Keep its look. Generic frontend advice (vary fonts or themes, gradients, page-load or staggered reveals, "2-3 intentional motions", Framer Motion) does not apply here, and other design skills lose where they disagree.

1. Use installed components first (`components/ui`, `components/reui`): tables `data-grid`, filtering `filters`, boards `kanban`, modals `Dialog` or `AlertDialog`, toasts `sonner`. Never set height, radius, padding, shadow or motion on them; use `size`, `variant`, `spacing`.
2. Color: semantic tokens. State: `<Badge variant="success-light">` from `@/components/reui/badge` at default size, or Alert variants. Raw palette only for categorical identity, with its `dark:` pair.
3. Spacing: `gap-*` on the parent: `gap-1` to `gap-2` in a row, `gap-3` to `gap-4` between groups, `gap-6` to `gap-8` between sections. Type: `text-sm` body, `text-xs` meta, nothing smaller; never resize FrameTitle or CardTitle.
4. Motion: installed parts already animate; never retime them. Yours: hover `transition-colors`; reveal `duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]`; transform and opacity only; never `transition-all`, bounce, or a stagger on table rows or lists of 20+; at most 1 entrance per view; `MotionConfig reducedMotion="user"` plus `motion-reduce:`.
5. Every data region: empty state with an action, `Skeleton` loading, inline error with Retry.
6. Before UI code, write the plan from `.agents/skills/reui/SKILL.md` in your reply. Before you finish, run its self-check on the files you changed and fix every hit (2 rounds at most). Full rules: `.agents/skills/reui/SKILL.md`. If that folder is missing, call the `reui` MCP tool `get_agent_skill`.

Managed by the ReUI installer. Edits between the markers are replaced on the next run.
<!-- END:reui-agent-rules -->
