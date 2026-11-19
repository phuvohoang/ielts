# Gemini generation and grading

The production Worker configuration selects `AI_PROVIDER=gemini` and
`GEMINI_MODEL=gemini-3.5-flash-lite`. Authoring, the independent question audit,
semantic grading, adjudication and source coverage all use the server-only
adapter in `worker/provider.ts`. No Workers AI inference runs in this mode.
Cloudflare still hosts the API, rate limits and existing Durable Object sessions.
The website remains on GitHub Pages. There are no IndexedDB migrations or data
resets in this provider change.

## Required secret

Before deploying this configuration, open Cloudflare → Workers & Pages →
`ielts-grammar-grader` → Settings → Variables and Secrets. Add a **Secret** named
`GEMINI_API_KEY`, using a Gemini API key from Google AI Studio. Save/deploy the
secret. Never put the key in `vars`, GitHub source, a `VITE_*` variable, or Pages
build settings. A key exposed in conversation or screenshots should be rotated.

With an authenticated Cloudflare CLI, the equivalent is:

```sh
npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.jsonc
npm run worker:deploy
```

Use a separate secret for a preview environment. Secrets are not copied into
preview environments automatically. Gemini API billing and rate limits are
separate from Cloudflare's. A key that lists a model does not necessarily have
permission to generate with it: verify an actual request. Gemini 2.5 Flash-Lite
was listed but rejected for this account; 3.5 Flash-Lite was available.

## Local verification

Use an ignored `worker/.dev.vars` file containing `GEMINI_API_KEY` and, for local
browser work, `ALLOWED_ORIGINS=http://127.0.0.1:5173`. Run `npm run worker:dev`,
then start Vite with
`VITE_GRAMMAR_API_URL=http://127.0.0.1:8787/api/grammar/grade`.

Run `npm test`, `npm run build`, `npm run worker:check` and
`npm run test:e2e`. The opt-in live test is:

```sh
RUN_LIVE_GEMINI=1 npx vitest run src/lib/ai/dynamic/gemini-live.test.ts
```

Supply `GEMINI_TEST_API_KEY` through the test process's secure environment.
It generates ten independently audited B2 questions and checks valid paraphrases
and genuine grammar errors using real Gemini calls; it incurs API usage.
In proxy-managed Node environments use `NODE_USE_ENV_PROXY=1` if required.

Structured output is still parsed and validated by Zod and the existing quality
checks. Blocked/truncated responses and provider errors remain unscored. Keys
are sent in the provider request header and never returned to the learner;
provider error bodies are not forwarded. Model output is not guaranteed correct:
the existing uncertainty handling, independent audit and semantic adjudication
remain necessary. No automatic fallback to a different billable provider occurs.

Optional `GEMINI_GENERATION_MODEL` overrides authoring; `GEMINI_MODEL` handles
auditing and grading. Change to `AI_PROVIDER=cloudflare` to explicitly restore
the prior configured Workers AI models and restore the `ai: { binding: "AI" }`
binding in both production and preview configuration. Sync config changes with
`npm run worker:sync-config` before committing.
