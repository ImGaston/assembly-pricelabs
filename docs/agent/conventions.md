# Conventions

How to write code that fits this repo. See also:
[project-map](project-map.md) · [integrations](integrations.md) ·
[performance](performance.md) · [decisions](decisions.md).

## Language & modules

- Plain JavaScript, **ES modules** (`import`/`export`). No TypeScript, no JSX in the output path.
- 2-space indent, single quotes, semicolons — match the surrounding file.
- `lib/*.js` are pure logic modules; the route wires them together.

## Rendering (the core pattern)

- **Server-rendered HTML strings only. No client-side JavaScript** — no `<script>`, no hydration, no fetch in the browser. Interactivity is done with plain links (e.g. the pricing/SEO tabs) and CSS (`<details>` for collapsibles).
- **Charts are inline SVG**, computed server-side (see `renderPacingChart` and the SEO funnel/trend in `lib/render.js`). Clone those patterns for new charts.
- **Styling is inline CSS** in one `<style>` block built from design tokens. Use the `c` (colors) and `f` (font families) helpers in `render.js`; never hardcode hex/fonts.
- **Scope new CSS** to avoid collisions — e.g. SEO styles live under `.seo-view`. Reuse existing class names only within their scope.
- **Always `escapeHtml()`** any dynamic value put into HTML or SVG (`title`s, names, cities, etc.).

## Design system (`config/design-tokens.json`)

"Paper-on-Stone" aesthetic. Hard rules:
- **No 1px solid borders** — separate regions with background shifts (`level1/2/3`).
- **No standard drop shadows** — only the ambient `box-shadow: 0 20px 40px rgba(29,28,20,0.05)`.
- **Display/serif text (Newsreader) is always lowercase**; body is Inter; all numbers use JetBrains Mono.
- 2px radius on controls, 12px on cards. Cards sit on `level2` over the `paper` page.
- Semantic colors: success = above market, warning = at/near market, error = below market. Use `performanceColor()` / `indexColor()` / `yoyColor()` in `render.js`.

## Backend patterns

- **Supabase access** only via the service-role singleton `getSupabase()` (`lib/supabase.js`). It throws if env vars are missing.
- **Per-client data modules** (`reports.js`, `seo.js`, `clients.js`, `pricelabs.js`) follow the same shape: module-level `Map` cache + TTL, check cache → query → cache → return; export a `clear*Cache()`. Return `null`/empty shape rather than throwing when a client simply has no data.
- **Numbers:** coerce nullable DB values with a small `num()` helper; keep `null` distinct from `0`.

## Error handling

- The route validates auth first and returns `renderErrorPage(status, msg)` for `not_found` (404), `unauthorized` (401), `lookup_failed` (503).
- Wrap data fetch + render in `try/catch`; log with `console.error` and return a 500 error page. Never leak stack traces or keys into the response.
- Missing/empty data is a normal path (empty state / `no-store`), not an error.

## Testing

- **No test framework or CI is configured (TBD).** Verify changes by running the app — see AGENTS.md → Verification Defaults and use the browser-preview MCP tools (screenshot, console, snapshot).

## Security & secrets

- Secrets live in **environment variables only** (see `integrations.md`): `PRICELABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Only `NEXT_PUBLIC_*` may reach the browser. The service-role key and PriceLabs key are **server-only** and must never appear in rendered HTML.
- `.env.local` is gitignored — never commit it. Never paste real keys, client `dashboard_token`s, or client PII into code, commits, or `docs/`.
- Per-client auth = UUID + `dashboard_token`, compared with `crypto.timingSafeEqual`. Tokens gate all data access server-side.
- New Supabase tables should have **RLS enabled** (the app uses service role, which bypasses RLS, so this only locks out anon/authenticated keys).
