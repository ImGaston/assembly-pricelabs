# RevFactor Client Pricing Portal

## Project overview

A serverless application that fetches pricing data from PriceLabs Customer API and renders branded read-only dashboards for STR (short-term rental) property owners. Each dashboard is embedded via iframe into Assembly.com client portals.

## Architecture

```
PriceLabs Customer API → Vercel Serverless Function → Branded HTML Dashboard → Assembly iframe embed
```

### Request flow

1. Client accesses their Assembly portal → clicks "Pricing Dashboard" tab
2. Assembly loads iframe: `https://assembly-pricelabs.vercel.app/api/dashboard/[client-uuid]?token=[secret]`
3. Vercel function validates the UUID + token against the Hub's Supabase `clients` table
4. Function reads the client's `pricelabs_group` + `listings` (for name overrides) from Supabase
5. Function calls PriceLabs API → fetches all listings, filters by group
6. Function renders a self-contained HTML page with the dashboard
7. HTML is cached in-memory for 6 hours (Vercel serverless, resets on cold start)

## Tech stack

- **Runtime**: Vercel serverless functions (Node.js)
- **Framework**: Next.js 14 App Router with API routes
- **Styling**: Inline CSS using RevFactor design tokens (`config/design-tokens.json`)
- **Data sources**: PriceLabs Customer API (pricing data) + Supabase Hub (client registry)
- **Deployment**: Vercel — `https://assembly-pricelabs.vercel.app`
- **Config**: Environment variables only (no static JSON config)
- **Repo**: https://github.com/ImGaston/assembly-pricelabs

## PriceLabs Customer API

**Base URL**: `https://api.pricelabs.co/v1`

**Authentication**: API key as query param `?api_key=...`. Stored in env var `PRICELABS_API_KEY`.

**API Key** (Customer API key — NOT Personal Access Token):
- Customer API key: stored in Vercel env vars as `PRICELABS_API_KEY`
- PAT tokens (`patNJTx...`) do NOT work with this API

### Working endpoints

- `GET /v1/listings?api_key=...` — Returns ALL listings in the account with occupancy, market data, ADR, MPI, booking pickup, etc.

### Endpoints that DO NOT work with this API key

- `GET /v1/reservations` → 404
- `GET /v1/listings/{id}/overrides` → invalid request
- `GET /v1/getPrices` → 404

### Important API notes

- Returns 488 listings total across all clients
- Listing IDs: Hostaway = numeric (e.g. `121000`), Hospitable = UUID (e.g. `07b4e0ba-...`)
- Field names for occupancy: `adjusted_occupancy_next_30`, `market_adjusted_occupancy_next_30`
- ADR fields: `adr_past_30`, `adr_next_30`, `stly_adr_past_30` (same time last year)
- MPI field: `mpi_next_30`
- Booking pickup: `booking_pickup_past_15`
- Group field: `group` — used to filter listings per client

## Client configuration

Clients live in the Hub's Supabase `clients` table. The dashboard reads directly from there — no static JSON.

Required columns on `clients`:
- `id` (uuid) — used in the dashboard URL
- `name` — shown in the dashboard header
- `dashboard_token` — URL-auth secret, auto-generated via `encode(gen_random_bytes(16), 'hex')`
- `pricelabs_group` — PriceLabs group name used to filter listings
- `market` — primary market label shown in header

Display-name overrides come from the Hub's `listings` table: for each row, `listings.name`/`city`/`state` overrides whatever PriceLabs returns for that `listing_id`. No `nameOverrides` map needed.

Adding a new client = insert a row in the Hub. The dashboard picks it up on next request (10 min cache).

### Demo client

ID: `demo` (hardcoded in `lib/clients.js`, not in Supabase)
Token: `demo_revfactor_2024_showcase`
URL: `https://assembly-pricelabs.vercel.app/api/dashboard/demo?token=demo_revfactor_2024_showcase`

Uses 8 fictional listings with realistic mock data. Safe to share with prospects.

## Security model (MVP)

- Each client URL has a unique token: `/api/dashboard/[slug]?token=[secret]`
- Token is validated server-side before any data is fetched
- No client-side JavaScript that exposes the PriceLabs API key
- The HTML response is fully server-rendered (no client-side API calls)
- Assembly embeds the iframe — the client never sees the raw URL

**Future (Phase 2)**: Migrate to Assembly Custom App SDK with encrypted session tokens.

## Dashboard layout

### What the client sees

A single responsive HTML page with:

#### 1. Header
- RevFactor logo (inline SVG)
- Client name (Newsreader/Cormorant Garamond, lowercase)
- "Last updated" timestamp + market name
- Tagline: "intelligent pricing for inspired stays"
- "Sample Data" badge if using mock data

#### 2. KPI cards (6 cards, 3-column grid)
- **Active Listings**: count of listings in portfolio
- **Avg Occupancy (30d)**: weighted average across listings
- **Market Occupancy (30d)**: average market benchmark
- **Performance Index**: occupancy / market ratio (color coded)
- **Avg ADR (30d)**: average daily rate with STLY comparison
- **ADR vs Last Year**: YoY percentage change (color coded)

#### 3. Listings overview table
- Listing name + city/bedrooms subline
- Occ (30d), Market Occ, vs Market (color badge)
- ADR (30d), vs Last Year (color badge)
- Pickup (15d) — bookings in last 15 days
- MPI (30d) — market performance index (color badge)

#### 4. Footer
- RevFactor logo
- "Managed by RevFactor"
- "intelligent pricing for inspired stays"

### What the client does NOT see

- PriceLabs configuration (base prices, customizations, seasonal profiles)
- Pricing calendar (removed — no per-date data available from Customer API)
- Other clients' data
- Any edit/modify controls
- RevFactor billing or internal metrics

## Design system

Based on `revfactor-design system.md` — "The Modern Archivist" / "Paper-on-Stone" aesthetic.

### Colors

**Surfaces** (no-line rule — boundaries via background shifts only):
- `surface` `#FCF9F2` — primary canvas / paper
- `surface-dim` `#E9E5D8` — stone base layer
- `level0` `#DEDACD` — base
- `level1` `#FEF9EC` — section
- `level2` `#F8F3E6` — interaction / card background
- `level3` `#E6E2D5` — highlight

**Brand**:
- `cedar` `#13342D` — primary actions, links (used with 145° gradient)
- `walnut` `#76574C` — body text
- `tobacco` `#3F261F` — headings
- `onyx` `#161910` — primary text
- `moss` `#5D6D59` — labels, accents

**Semantic**:
- Success `#4A7C59` (bg `#E2EDDF`) — above market
- Warning `#9A7B4F` (bg `#F0E8D8`) — near market
- Error `#8B3A3A` (bg `#F0DADA`) — below market

### Typography

- **Display/Headers**: `Newsreader` (Google Fonts) — always lowercase
- **Body/UI**: `Inter` (Google Fonts) — standard casing, generous tracking on labels
- **Numbers/Data**: `JetBrains Mono` — all numerical data

### Key design rules

- **No 1px solid borders** — use background shifts for separation
- **No standard drop shadows** — only ambient: `box-shadow: 0 20px 40px rgba(29,28,20,0.05)`
- **2px border-radius** on buttons/inputs (sharp professional)
- **12px border-radius** on cards
- **Lowercase** for all Newsreader/display text
- Cards: `level2` (#F8F3E6) background on `surface` (#FCF9F2) page

## File structure

```
assembly-pricelabs/
├── AGENTS.md                          # This file
├── config/
│   └── design-tokens.json             # Design system tokens
├── migrations/
│   └── 001_seed_clients_pricelabs.sql # One-time migration of pricelabs_group + market into Hub
├── app/
│   └── api/
│       └── dashboard/
│           └── [slug]/
│               └── route.js           # Main API route handler
├── lib/
│   ├── pricelabs.js                   # PriceLabs API client + data mapping
│   ├── supabase.js                    # Supabase client singleton
│   ├── clients.js                     # Client lookup from Supabase (+ demo hardcoded)
│   ├── auth.js                        # UUID + token validation
│   ├── render.js                      # HTML template renderer
│   └── mock-data.js                   # Mock data generator (demo + fallback)
├── public/
│   └── logo.svg
├── package.json
├── next.config.js
├── vercel.json
└── .env.example
```

## Environment variables

```
PRICELABS_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Set in Vercel → Project Settings → Environment Variables.

## Development workflow

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in PriceLabs + Supabase creds
3. `npx next dev` for local development (port 3000)
4. Test demo: `http://localhost:3000/api/dashboard/demo?token=demo_revfactor_2024_showcase`
5. Test a real client: grab `id` + `dashboard_token` from Supabase `clients` table
6. Deploy: `git push origin main` (auto-deploys via Vercel GitHub integration)

## Caching strategy

- **In-memory cache**: `Map()` in `lib/pricelabs.js`, 6-hour TTL
- **Vercel**: `Cache-Control: s-maxage=21600, stale-while-revalidate=3600`
- Cache is **volatile** — resets on Vercel cold start (serverless)
- PriceLabs updates data once per day (overnight), so 6h cache is sufficient
- No persistent cache needed for MVP (PriceLabs API has no strict rate limits)

## Assembly embed setup

For each client: Assembly → App Setup → Add → Show as embed → paste URL:

```
https://assembly-pricelabs.vercel.app/api/dashboard/[client-uuid]?token=[dashboard_token]
```

The Hub exposes a "Copy embed link" button that builds this URL from the `clients` row.

## Current status (April 2026)

### Deployed & working
- [x] Next.js App Router API routes on Vercel
- [x] PriceLabs API integration (GET /v1/listings, filters by group)
- [x] Supabase-backed client registry — adding a client = inserting a Hub row
- [x] Token-based auth per client (auto-generated via Supabase default)
- [x] Branded HTML dashboard — KPI cards + listings table
- [x] Design system applied (Paper-on-Stone aesthetic)
- [x] Responsive (works in Assembly iframe)
- [x] Demo/template client for prospect showcases
- [x] Mock data fallback when API unavailable
- [x] GitHub repo: https://github.com/ImGaston/assembly-pricelabs
- [x] Vercel deploy: https://assembly-pricelabs.vercel.app

### Pending
- [ ] Add custom domain `portal.revfactor.co` in Vercel → Settings → Domains
- [ ] Configure Assembly embeds for all clients (Hub "Copy embed link" button)

## Future phases

- **Phase 2**: Assembly Custom App SDK integration (auto-identify client, no token in URL)
- **Phase 3**: Add RevPulse pacing data to the same dashboard
- **Phase 4**: Hospitable reservation data integration
- **Phase 5**: Historical performance trends (month-over-month)
