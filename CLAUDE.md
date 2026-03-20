# RevFactor Client Pricing Portal

## Project overview

A serverless application that fetches pricing data from PriceLabs Customer API and renders branded read-only dashboards for STR (short-term rental) property owners. Each dashboard is embedded via iframe into Assembly.com client portals.

## Architecture

```
PriceLabs Customer API → Vercel Serverless Function → Branded HTML Dashboard → Assembly iframe embed
```

### Request flow

1. Client accesses their Assembly portal → clicks "Pricing Dashboard" tab
2. Assembly loads iframe: `https://portal.revfactor.co/api/dashboard/[client-slug]?token=[secret]`
3. Vercel function receives request → validates token → looks up listing IDs for that client
4. Function calls PriceLabs API → fetches pricing data for those listings
5. Function renders a self-contained HTML page with the dashboard
6. HTML is cached (ISR / stale-while-revalidate, 6-12 hours)

## Tech stack

- **Runtime**: Vercel serverless functions (Node.js)
- **Framework**: Next.js API routes OR plain Vercel functions (either works)
- **Styling**: Inline CSS using RevFactor design tokens (no external CSS framework)
- **Data source**: PriceLabs Customer API (REST, JSON)
- **Deployment**: Vercel with custom domain `portal.revfactor.co`
- **Config**: Environment variables + `config/clients.json` for client-listing mapping

## PriceLabs Customer API

**Base URL**: `https://api.pricelabs.co/v1` (confirm from Swagger docs)

**Authentication**: API key passed as query parameter or header. Key is stored in env var `PRICELABS_API_KEY`.

**Swagger docs**: https://app.swaggerhub.com/apis-docs/Customer_API/customer_api/1.0.0-oas3

### Key endpoints

- `GET /getListingDetails` — Returns listing metadata (name, address, bedrooms, etc.)
- `GET /getPrices` — Returns recommended prices per date for a listing

### Important notes

- The API key comes from PriceLabs Account Settings → enable Customer API
- Rate limits: unknown, implement conservative caching (6h minimum)
- Listing IDs vary by PMS: Hostaway uses numeric IDs, Hospitable uses UUIDs

## Client configuration

See `config/clients.json` for the mapping of client slugs to listing IDs and access tokens.

Each client entry contains:
- `slug`: URL-safe identifier (used in the route)
- `name`: Display name for the dashboard header
- `token`: Secret token for URL-based auth (simple bearer check)
- `listings`: Array of PriceLabs listing IDs
- `market`: Primary market name for context

## Security model (MVP)

- Each client URL has a unique token: `/api/dashboard/[slug]?token=[secret]`
- Token is validated server-side before any data is fetched
- No client-side JavaScript that exposes the PriceLabs API key
- The HTML response is fully server-rendered (no client-side API calls)
- Assembly embeds the iframe — the client never sees the raw URL

**Future (Phase 2)**: Migrate to Assembly Custom App SDK with encrypted session tokens for automatic client identification.

## Dashboard layout

### What the client sees

The dashboard is a single responsive HTML page with these sections:

#### 1. Header
- RevFactor logo (SVG inline or hosted)
- Client name
- "Last updated" timestamp
- Tagline: "Intelligent Pricing for Inspired Stays"

#### 2. KPI cards (top row)
- **Active listings**: Count of listings in this portfolio
- **Avg occupancy (30d)**: Weighted average across listings
- **Market occupancy (30d)**: Average market benchmark
- **Performance index**: Occupancy vs market ratio

#### 3. Listings overview table
- Listing name
- City/State
- Occupancy (30d) with color indicator vs market
- Last booked date
- Nights booked (15d)
- MPI (30d)

#### 4. Pricing calendar (per listing or aggregated)
- Next 30-60 days of recommended prices
- Min stay requirements
- Date-level view with weekday/weekend differentiation

#### 5. Footer
- RevFactor branding
- "Managed by RevFactor" attribution
- Contact info or link

### What the client does NOT see

- PriceLabs configuration (base prices, customizations, seasonal profiles)
- Other clients' data
- Any edit/modify controls
- RevFactor billing or internal metrics

## Design system

### Colors (brand palette)
- **Bone** `#DDDAD3` — Page background, content blocks
- **Bone Light** `#E8E6E1` — Card backgrounds, alternating rows
- **Moss** `#5D6D59` — Accent elements, secondary labels
- **Cedar** `#13342D` — Primary actions, links, active states
- **Walnut** `#76574C` — Body text, descriptions
- **Tobacco** `#3F261F` — Headings, navigation
- **Onyx** `#161910` — Primary text, critical elements

### Semantic colors
- **Success** `#4A7C59` (bg: `#E2EDDF`) — Above-market performance
- **Warning** `#9A7B4F` (bg: `#F0E8D8`) — Near-market performance
- **Error** `#8B3A3A` (bg: `#F0DADA`) — Below-market performance

### Typography
- **Headers**: `'Cormorant Garamond', Georgia, serif` — weight 400, lowercase
- **Body**: `Helvetica, 'Helvetica Neue', Arial, sans-serif` — weight 400
- **Numbers/Data**: `'JetBrains Mono', 'SF Mono', monospace`
- **Accent/Buttons**: Helvetica, weight 700, UPPERCASE, letter-spacing 1.5px

### Layout rules
- Max width: 1200px, centered
- Card border-radius: 12px
- Card background: Bone Light `#E8E6E1`
- Page background: Bone `#DDDAD3`
- Table headers: UPPERCASE, small, letter-spaced (accent style)
- Numerical data always in JetBrains Mono
- Currency: `$X,XXX` (no decimals for large numbers)
- Percentages: `XX%`
- Dates: `Mon DD, YYYY` in UI, `YYYY-MM-DD` in data

### Font loading
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## File structure

```
revfactor-portal/
├── CLAUDE.md                  # This file
├── config/
│   └── clients.json           # Client → listing ID mapping
├── api/
│   └── dashboard/
│       └── [slug].js          # Main serverless function
├── lib/
│   ├── pricelabs.js           # PriceLabs API client
│   ├── auth.js                # Token validation
│   └── render.js              # HTML template renderer
├── public/
│   └── logo.svg               # RevFactor logo
├── package.json
├── vercel.json
└── .env.example
```

## Environment variables

```
PRICELABS_API_KEY=your_pricelabs_customer_api_key
CLIENT_CONFIG_SECRET=optional_master_key_for_config_encryption
```

## Development workflow

1. `npm install`
2. Copy `.env.example` to `.env.local` and add your PriceLabs API key
3. `npx vercel dev` for local development
4. Test with: `http://localhost:3000/api/dashboard/grant-currant?token=test-token-grant`
5. Deploy: `npx vercel --prod`

## Caching strategy

- **PriceLabs data**: Cache responses for 6 hours (prices update overnight in PriceLabs)
- **Vercel ISR**: Use `Cache-Control: s-maxage=21600, stale-while-revalidate=3600`
- **Client config**: Loaded from JSON file, no caching needed (static per deploy)

## Assembly embed setup

Once deployed, each client gets an iframe embed in Assembly:

1. Assembly → App Setup → "Don't see your app?" → Add
2. Title: "Pricing Dashboard" | Icon: chart icon
3. Setup type: **Manual** (different content per client)
4. For each client: Add → Select client → Show as embed → Paste URL:
   `https://portal.revfactor.co/api/dashboard/[slug]?token=[token]`

## MVP scope (Phase 1)

- [x] Serverless function with client routing
- [x] PriceLabs API integration (listing details + prices)
- [x] Token-based auth per client
- [x] Branded HTML dashboard with KPI cards + listings table
- [x] Responsive design (works in Assembly iframe)
- [x] 3 beta testers: Grant Currant, Alicia Amarant, Elizabeth Carlson

## Future phases

- **Phase 2**: Assembly Custom App SDK integration (auto-identify client)
- **Phase 3**: Add RevPulse pacing data to the same dashboard
- **Phase 4**: Hospitable reservation data integration
- **Phase 5**: Historical performance trends (month-over-month)
