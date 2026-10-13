# Conventions

How to write code that fits this repo. See also:
[project-map](project-map.md) · [integrations](integrations.md) ·
[performance](performance.md) · [decisions](decisions.md).

## Language & modules

- Plain JavaScript, **ES modules** (`import`/`export`). No TypeScript, no JSX in the output path.
- 2-space indent, single quotes, semicolons — match the surrounding file.
- `lib/*.js` are pure logic modules; the route wires them together.

## Rendering (the core pattern)

- **Server-renders all content; JS is progressive enhancement only** (see `decisions.md` 2026-07-02). Prefer plain links (tabs, SEO drill-down) and CSS (`<details>`). Add a `<script>` only to *enhance* server-rendered content — never to fetch or build the base view.
- **Charts are inline SVG**, computed server-side (see `renderPacingChart`, the SEO funnel/trend, and the per-listing `ld*` chart builders in `lib/render.js`). Clone those patterns for new charts.
- **When you do add JS** (e.g. `LISTING_DETAIL_JS`, `renderListingDetail`): keep it one small inline vanilla script; the view must render fully with JS off (stacked panels reachable via `?listing=`/`?tab=`). Only public metrics may be embedded for the client — **never secrets** (rule #2). Escape any data put in a `data-tip`/JSON payload (`JSON.stringify(x).replace(/</g,'\\u003c')`). Don't write JS that changes iframe height (breaks Assembly's embed); tabs/tooltips are height-neutral.
- **Styling is inline CSS** in one `<style>` block built from design tokens. Use the `c` (colors) and `f` (font families) helpers in `render.js`; never hardcode hex/fonts.
- **Scope new CSS** to avoid collisions — e.g. SEO styles live under `.seo-view`. Reuse existing class names only within their scope.
- **Always `escapeHtml()`** any dynamic value put into HTML or SVG (`title`s, names, cities, etc.).

## Creating a new dashboard model

1. Add `lib/layouts/<key>.js` exporting `{ key, name, description, render }`. `render(client, data, { tab, seo, listing, reservations })` returns the full HTML page (same contract as `renderDashboard`). Reuse section renderers from `lib/render.js` (export what you need) rather than copying them.
2. Register it in `LAYOUTS` in `lib/layouts/index.js`. A one-page model sets `singlePage: true` and declares extra data with `needs: { seo, dayOfWeek }` — the route then loads the report + those datasets and ignores `?tab`/`?listing` (see `performance-report.js`). Building blocks exported from `render.js`: `c`, `f`, `escapeHtml`, `htmlHead(title, extraCss)`, `renderHeader`, `renderFooter`, `TOOLTIP_JS` (shared styled tooltip: add `<div id="ld-tip">` + elements with an escaped HTML `data-tip`; keep a `<title>` as the no-JS fallback and strip it in JS — see `hits()` in `performance-report.js`).
   - **Own data source:** export `load({ client, dataClient, params, isMock })` → `{ data, ...opts }` or `{ error: { status, message } }`; the route calls it instead of the Hub report and passes `listing`, `view`, `date`, `res`, `others`, `layoutParam` to `render` (see `pricelabs-report.js`). Carry `layoutParam` into every link so `?layout=` previews keep the model while iterating.
   - Mock fields: new mock values must use their own seeded stream (see `lyRng` in `generateMockReportData`) so existing demo figures don't shift.
3. Iterate locally: `/api/dashboard/demo?token=demo_revfactor_2024_showcase&layout=<key>` (the `layout` param is ignored in production). Same rules as every dashboard: server-rendered, JS only as enhancement, tokens, `escapeHtml`.
4. Deploy, then assign it in `/admin` (beta dashboard → Model, or per-client Model). Unknown keys render `standard`, so removing a model is safe.

## Design system (`config/design-tokens.json`)

"Paper-on-Stone" aesthetic — **client dashboards only**. The internal `/admin` follows the RevFactor Hub's shadcn look instead (`app/admin/styles.js`; see decisions 2026-10-12). Hard rules:
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

## Gotchas

- **SWC minifier drops static template chunks (Next 14.2.35).** A helper returning
  `` `…?tab=x` + `&token=${…}` `` (template-literal concatenation), when inlined by the
  minifier into another template, loses the static `?tab=x` part — prod builds emitted
  `/api/dashboard/demo&token=…` → 404, while `next dev` was fine. Write URL-building
  helpers as a **single template literal** (no `+` between templates) and verify prod
  behavior with `next build && next start`, not just `next dev`. (2026-07-13, back links.)

## Testing

- **No test framework or CI is configured (TBD).** Verify changes by running the app — see AGENTS.md → Verification Defaults and use the browser-preview MCP tools (screenshot, console, snapshot).

## Security & secrets

- Secrets live in **environment variables only** (see `integrations.md`): `PRICELABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Only `NEXT_PUBLIC_*` may reach the browser. The service-role key and PriceLabs key are **server-only** and must never appear in rendered HTML.
- `.env.local` is gitignored — never commit it. Never paste real keys, client `dashboard_token`s, or client PII into code, commits, or `docs/`.
- Per-client auth = UUID + `dashboard_token`, compared with `crypto.timingSafeEqual`. Tokens gate all data access server-side.
- New Supabase tables should have **RLS enabled** (the app uses service role, which bypasses RLS, so this only locks out anon/authenticated keys).
