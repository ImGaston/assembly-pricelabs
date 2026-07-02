# AGENTS.md — RevFactor Client Pricing Portal

> Routing file for AI agents. Keep this short. Durable technical memory lives in
> [`docs/agent/`](docs/agent/) — read the file that matches your task before coding.

## Project Snapshot

Serverless app that renders branded, **read-only** STR pricing + SEO dashboards,
embedded via iframe in Assembly.com client portals. Fully **server-rendered HTML,
no client-side JS**, inline SVG charts, inline CSS from design tokens.

- **Stack:** Next.js 14 App Router · React 18 · plain JS (ESM, no TypeScript) · npm
- **Data:** Supabase Hub (client registry, report + SEO tables) + PriceLabs Customer API
- **Deploy:** Vercel (`assembly-pricelabs.vercel.app`), push to `main` auto-deploys
- **Entry point:** [`app/api/dashboard/[slug]/route.js`](app/api/dashboard/[slug]/route.js) → `?token=…&tab=pricing|seo`
- **Demo (no DB):** `/api/dashboard/demo?token=demo_revfactor_2024_showcase`

## Memory Map — read by task

| If your task touches… | Read |
|---|---|
| structure, modules, routes, DB tables, commands | [`docs/agent/project-map.md`](docs/agent/project-map.md) |
| how to write code here (patterns, errors, tests, secrets) | [`docs/agent/conventions.md`](docs/agent/conventions.md) |
| PriceLabs / Supabase / Rankbreeze / Assembly / Vercel | [`docs/agent/integrations.md`](docs/agent/integrations.md) |
| caching, cold starts, slow queries/endpoints | [`docs/agent/performance.md`](docs/agent/performance.md) |
| why something is the way it is | [`docs/agent/decisions.md`](docs/agent/decisions.md) |
| what happened recently / rolling summary | [`docs/agent/sessions.md`](docs/agent/sessions.md) |

## Critical Rules

1. **JS is allowed only as progressive enhancement.** Everything renders server-side (charts are inline SVG); the base render must never depend on JS. Client JS may *enhance* (client-side sub-tabs, hover tooltips) but every view must stay reachable and readable with JS disabled (via URL params / stacked panels). See `decisions.md` (2026-07-02 JS adoption) and `conventions.md`. _Assembly's iframe was verified to run JS._
2. **Never expose secrets to the browser.** PriceLabs/Supabase service keys are server-only; the HTML must not contain them. Only `NEXT_PUBLIC_*` vars may reach the client.
3. **Use the design tokens** (`config/design-tokens.json` via the `c`/`f` helpers in `lib/render.js`). No 1px borders, no drop shadows — see conventions.
4. **`escapeHtml()` all data** interpolated into HTML/SVG.
5. **Supabase reads go through the service-role singleton** (`lib/supabase.js`); service role bypasses RLS.
6. **Never commit secrets.** `.env.local` is gitignored; keep real keys/tokens out of the repo and out of these docs.

## Durable Memory Updates

When work reveals something durable, update `docs/agent/` (not this file):
- New/changed module, route, or DB table → `project-map.md`
- New pattern, convention, or gotcha → `conventions.md`
- New/changed external service → `integrations.md`
- New caching/perf decision or hotspot → `performance.md`
- A technical decision with trade-offs → `decisions.md` (dated)
- End of a working session → append a short entry to `sessions.md`

Do **not** store secrets, tokens, client PII, or private user preferences in these files.

## Verification Defaults

- No automated test suite, lint, or typecheck is configured (see `conventions.md`). Doc-only changes need no build.
- For code changes, verify by running the app and observing behavior — prefer the browser-preview MCP tools over manual checks:
  - `npm run dev` (or `npx next dev`) on port 3000.
  - Load the demo (works without DB): `/api/dashboard/demo?tab=seo&token=demo_revfactor_2024_showcase`.
  - Confirm no console errors, **no secrets in the HTML**, and that views still render with JS disabled (progressive enhancement). Any `<script>` must be enhancement-only.
- Real clients need `.env.local` creds (Supabase service-role key) — see `integrations.md`.
