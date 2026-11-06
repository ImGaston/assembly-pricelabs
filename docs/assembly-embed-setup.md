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

Before creating the embed, confirm that the client exists in Supabase and that
its rows in `listings` have the correct `client_id`. The dashboard uses those
`listing_id` values to select the client's PriceLabs data automatically.

`clients.pricelabs_group` is a compatibility fallback for older clients without
listing associations or whose legacy IDs no longer match PriceLabs.

For each client:

1. Go to the Pricing Dashboard app page
2. Click **Add** to add a new embed
3. Select the **client** (or company) to share with
4. Set display to **Show as embed**
5. Copy `clients.dashboard_url` from Supabase and paste it into the content box.

6. Click **Save**
7. Repeat for each client

### Testing

- Log in as each client (or use Assembly's client preview) to verify the dashboard loads
- Check that the iframe renders properly (no scrollbar issues, responsive)
- Verify data matches what you see in PriceLabs

### Troubleshooting

**Dashboard doesn't load?**
- Check that the URL contains the client's UUID and current `dashboard_token`
- Verify that the client's `listings` rows contain PriceLabs-compatible `listing_id` values
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

## Future: Custom App SDK (Phase 2)

Assembly supports Custom Apps that receive encrypted session tokens identifying the logged-in client. This eliminates the need for manual URL setup per client.

SDK docs: https://docs.assembly.com/docs/custom-apps-overview

Phase 2 migration plan:
1. Register a Custom App in Assembly
2. Use the SDK to decrypt the session token → get client email/ID
3. Map client ID to their listing IDs
4. Render the same dashboard, but auto-routed
