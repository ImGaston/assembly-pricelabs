# Sessions

Rolling summary of working sessions. Keep it **short**: newest entry on top, a few
bullets each, and prune so this file stays scannable (roughly the last ~10 sessions).
For durable facts, update the topic files instead (see [AGENTS.md](../../AGENTS.md) →
Durable Memory Updates).

How to maintain:
- At the end of a session, add one dated entry: what changed, what's verified, what's next.
- Move anything durable (a decision, a new module/table, a convention) into the right
  `docs/agent/*` file and just reference it here.
- Don't store secrets, tokens, or client PII.

---

## 2026-07-02 — SEO Visibility tab + agent memory init

- **Shipped the SEO Visibility tab** (`?tab=seo`): migration `003_seo_metrics.sql`, `lib/seo.js`, SEO render components in `lib/render.js`, route branch, `generateMockSeoData`. Two commits on branch `claude/keen-merkle-3664ed` (`575c4ca` report module, `38645f0` SEO tab). See [decisions](decisions.md).
- **Verified** all three layouts (1 = funnel, 2–7 = cards, 8+ = matrix) against `docs/seo-drafts/` via the browser preview; no client JS.
- **Data loaded:** Rankbreeze CSV imported into `seo_metrics_raw` (43,991 rows, 218 Airbnb IDs; 191 matched, 27 unmatched, 76 clients with coverage). RLS enabled on the table.
- **Initialized this agent-memory system**: `AGENTS.md` as the routing file, `CLAUDE.md` → `@AGENTS.md`, and `docs/agent/` (this folder). The former knowledge-dump `AGENTS.md`/`CLAUDE.md` content was distilled into `project-map.md` / `conventions.md` / `integrations.md`.
- **Next:** confirm real clients render with `.env.local` creds; open PR `claude/keen-merkle-3664ed` → `main`; then run migration `003` in Supabase for prod (already imported to the Hub); decide funnel period semantics (last-complete-month vs snapshot-month) once reviewing real exports.
