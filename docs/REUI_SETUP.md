# ReUI for IELTS UI development

ReUI provides Codex design instructions, component discovery and a shadcn registry. It does not replace Gemini exercise generation or grading.

## Installed in this repository

- Official skill in `.agents/skills/reui`, pinned to version `68f0e6fa91`. `SOURCE.json` records the download URL and SHA-256 of each official file.
- Project instructions in `AGENTS.md` preserve Inter and the neutral palette, learner data and application behavior during scoped UI changes.
- Project MCP configuration in `.codex/config.toml`, using OAuth and Radix Vega.
- `@reui` registry in `components.json`: `https://reui.io/r/radix-vega/{name}.json`.
- TypeScript/Vite `@/` aliases and the shared `cn` utility required by registry components.

The current shadcn and @reui registries both use Radix Vega, following the user-selected Margin Finance reference. No UI components, dependencies or global theme were added during tooling setup. Existing custom CSS needs scoped semantic-token mapping when adopting a component.

The official skill bundle was copied from its download endpoint after inspecting the installer. Global Codex and other agents' configurations were not modified.

## Activate MCP

Open this trusted repository in Codex and restart the session to load project configuration and skills. Authenticate the ReUI server:

```sh
codex mcp login reui
```

If your CLI's MCP management command only reads global server configuration, use the project URL explicitly:

```sh
codex -c 'mcp_servers.reui.url="https://mcp.reui.io?style=radix-vega"' mcp login reui
```

Complete ReUI OAuth in your own browser. Configuration alone does not establish an authenticated MCP connection. A free ReUI account supports free-tier usage; premium assets require separate entitlement. Never commit OAuth tokens or license keys, or expose them through VITE variables.

## Use for UI work

Example request: “Dùng ReUI cải thiện màn cấu hình và bảng kết quả IELTS, giữ Inter, tông trắng–đen và logic hiện tại.”

Codex should read the installed skill, inspect existing components, discover matching Radix components and propose a scoped layout before editing UI. Use free assets unless premium use is explicitly authorized. Install only exact registry names verified through the documentation/MCP. Review a dry run before applying additions:

```sh
npx shadcn@latest add @reui/<verified-name> --dry-run --yes
```

Then inspect proposed file, dependency and CSS changes before running without `--dry-run`. Existing project components have their own APIs; do not assume ReUI props apply to them.

## Validation

The free registry resolved successfully through a real shadcn dry run. TypeScript lint and production build passed. MCP initialization without authentication returned the expected 401; login remains a separate user step.

Official instructions: https://reui.io/docs/codex

For the current Frame-led interface and floating sidebar, see [Margin design notes](MARGIN_DESIGN.md). The initial tooling-only installation below predates that interface migration.
