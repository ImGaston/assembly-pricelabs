# Assembly Portal — Embed Setup Guide

## How to embed the Pricing Dashboard in Assembly

### One-time setup

1. Go to **App Setup** in your Assembly admin
2. Click **+ Add an app** in the top right corner
3. Scroll to **"Don't see your app?"** and click **Add**
4. Configure:
   - **Title**: `Pricing Dashboard`
   - **Icon**: Choose a chart/analytics icon
   - **Setup type**: **Manual** (different content per client)
5. Click **Add**

### Per-client setup

For each beta tester client:

1. Go to the Pricing Dashboard app page
2. Click **Add** to add a new embed
3. Select the **client** (or company) to share with
4. Set display to **Show as embed**
5. Paste the client's unique URL into the content box:

| Client | URL |
|--------|-----|
| Grant Currant | `https://portal.revfactor.co/api/dashboard/grant-currant?token=TOKEN_HERE` |
| Alicia Amarant | `https://portal.revfactor.co/api/dashboard/alicia-amarant?token=TOKEN_HERE` |
| Elizabeth Carlson | `https://portal.revfactor.co/api/dashboard/elizabeth-carlson?token=TOKEN_HERE` |

6. Click **Save**
7. Repeat for each client

### Testing

- Log in as each client (or use Assembly's client preview) to verify the dashboard loads
- Check that the iframe renders properly (no scrollbar issues, responsive)
- Verify data matches what you see in PriceLabs

### Troubleshooting

**Dashboard doesn't load?**
- Check that the URL is correct (slug + token match config)
- Verify the Vercel deployment is live
- Check browser console for iframe errors

**"Restricted embed" error?**
- The Vercel function must set proper CORS headers:
  ```
  X-Frame-Options: ALLOWALL
  Content-Security-Policy: frame-ancestors *
  ```

**Data looks stale?**
- Cache refreshes every 6 hours
- Force refresh by appending `&nocache=1` to the URL (if implemented)

## Future: Custom App SDK (Phase 2)

Assembly supports Custom Apps that receive encrypted session tokens identifying the logged-in client. This eliminates the need for manual URL setup per client.

SDK docs: https://docs.assembly.com/docs/custom-apps-overview

Phase 2 migration plan:
1. Register a Custom App in Assembly
2. Use the SDK to decrypt the session token → get client email/ID
3. Map client ID to their listing IDs
4. Render the same dashboard, but auto-routed
