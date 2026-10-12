import { validateClient } from '../../../../lib/auth.js';
import { fetchClientData } from '../../../../lib/pricelabs.js';
import { getClientReport } from '../../../../lib/reports.js';
import { getClientSeo } from '../../../../lib/seo.js';
import { getClientReservations, getListingReservations } from '../../../../lib/reservations.js';
import { generateMockDayOfWeekBuckets, generateMockReportData, generateMockReservations, generateMockSeoData } from '../../../../lib/mock-data.js';
import { buildDayOfWeek, getClientDayOfWeek } from '../../../../lib/day-of-week.js';
import { renderErrorPage } from '../../../../lib/render.js';
import { getLayout } from '../../../../lib/layouts/index.js';

/**
 * GET /api/dashboard/[slug]?token=xxx
 * Returns a fully server-rendered HTML dashboard page.
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const tab = url.searchParams.get('tab') === 'seo' ? 'seo' : 'pricing';
  const listing = url.searchParams.get('listing'); // drill-down: single-listing view

  const auth = await validateClient(slug, token);

  if (auth.error === 'not_found') {
    return new Response(renderErrorPage(404, 'portfolio not found'), {
      status: 404,
      headers: responseHeaders(),
    });
  }

  if (auth.error === 'unauthorized') {
    return new Response(renderErrorPage(401, 'access denied'), {
      status: 401,
      headers: responseHeaders(),
    });
  }

  if (auth.error === 'lookup_failed') {
    return new Response(renderErrorPage(503, 'temporarily unavailable'), {
      status: 503,
      headers: responseHeaders(),
    });
  }

  // Linked managed dashboards render under their own slug but read data keyed
  // on the underlying Hub client.
  const dataClient = auth.client.dataClient || auth.client;
  // Dashboard model. `?layout=` override is dev-only (iterating on a new model
  // locally); in production the model comes from the client / dashboard row.
  const layoutOverride = process.env.NODE_ENV !== 'production' ? url.searchParams.get('layout') : null;
  const layoutKey = layoutOverride || auth.client.layout;
  const layout = getLayout(layoutKey);
  const { render } = layout;
  // Beta, non-standard and admin-managed links must not linger in the CDN.
  const cacheControl = auth.client.isManaged || auth.client.variant === 'beta' || (layoutKey && layoutKey !== 'standard')
    ? 'no-store'
    : 's-maxage=21600, stale-while-revalidate=3600';

  const isMock = !!(auth.client.useMockData && auth.client.demoListings);

  try {
    // Single-page models (e.g. performance-report): pricing report + whatever
    // extra datasets the model declares in `needs`, rendered as one page.
    if (layout.singlePage) {
      const data = isMock
        ? generateMockReportData(auth.client.demoListings)
        : await getClientReport(dataClient);
      if (!data) {
        return new Response(renderErrorPage(500, 'no report data yet'), { status: 500, headers: responseHeaders() });
      }
      const [seo, dayOfWeek] = await Promise.all([
        layout.needs?.seo
          ? (isMock ? generateMockSeoData(auth.client.demoListings) : getClientSeo(dataClient).catch((err) => {
              console.error('SEO load failed:', err.message);
              return null;
            }))
          : null,
        layout.needs?.dayOfWeek
          ? (isMock
              ? buildDayOfWeek(generateMockDayOfWeekBuckets(auth.client.demoListings, data.year, mockTotals(data)), auth.client.demoListings.length, data.year)
              : getClientDayOfWeek(dataClient, { year: data.year, listingIds: data.listings.map((l) => l.listingId) }))
          : null,
      ]);
      const html = render(auth.client, data, { seo, dayOfWeek });
      return new Response(html, { status: 200, headers: { ...responseHeaders(), 'Cache-Control': cacheControl } });
    }

    // SEO Visibility tab — a parallel view keyed off the same client/auth. A null
    // result (no SEO coverage) still renders 200 as an empty state.
    if (tab === 'seo') {
      const seo =
        auth.client.useMockData && auth.client.demoListings
          ? generateMockSeoData(auth.client.demoListings)
          : await getClientSeo(dataClient);

      const html = render(auth.client, null, { tab: 'seo', seo, listing });
      const isEmpty = !seo || !seo.listings || seo.listings.length === 0;

      return new Response(html, {
        status: 200,
        headers: {
          ...responseHeaders(),
          'Cache-Control': isEmpty ? 'no-store' : cacheControl,
        },
      });
    }

    let data;
    if (auth.client.useMockData && auth.client.demoListings) {
      data = generateMockReportData(auth.client.demoListings);
    } else {
      // Primary source: the Hub's daily PriceLabs report (Supabase).
      data = await getClientReport(dataClient);

      // Fallback: clients not yet covered by a report run still render off the
      // live PriceLabs API.
      if (!data && (auth.client.listingIds?.length || auth.client.priceLabsGroup)) {
        data = await fetchClientData({
          listingIds: auth.client.listingIds,
          groupName: auth.client.priceLabsGroup,
          nameOverrides: auth.client.nameOverrides,
        });
      }

      if (!data) {
        return new Response(
          renderErrorPage(500, 'no listings configured'),
          { status: 500, headers: responseHeaders() }
        );
      }
    }
    // Recent reservations — portfolio-wide on the roll-up, filtered to the one
    // listing on the drill-down's Overview. Fetch failures degrade to an empty
    // section inside the module.
    let reservations;
    if (auth.client.useMockData && auth.client.demoListings) {
      const pool = listing
        ? auth.client.demoListings.filter((l) => String(l.listingId) === String(listing))
        : auth.client.demoListings;
      reservations = generateMockReservations(pool);
    } else {
      reservations = listing
        ? await getListingReservations(dataClient, listing)
        : await getClientReservations(dataClient);
    }

    const html = render(auth.client, data, { tab: 'pricing', seo: null, listing, reservations });
    const isEmpty = !data.listings || data.listings.length === 0;

    return new Response(html, {
      status: 200,
      headers: {
        ...responseHeaders(),
        'Cache-Control': isEmpty ? 'no-store' : cacheControl,
      },
    });
  } catch (err) {
    console.error('Dashboard render error:', err);
    return new Response(
      renderErrorPage(500, 'something went wrong'),
      { status: 500, headers: responseHeaders() }
    );
  }
}

// Demo day-of-week figures are scaled to the mock report's year so sections agree.
function mockTotals(data) {
  const rows = data.listings.flatMap((l) => l.months);
  const occ = rows.filter((m) => m.occ != null);
  return {
    revenue: rows.reduce((s, m) => s + (m.revenue || 0), 0),
    occ: occ.length ? occ.reduce((s, m) => s + m.occ, 0) / occ.length : null,
  };
}

function responseHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'ALLOWALL',
    'Content-Security-Policy': 'frame-ancestors *',
    'Access-Control-Allow-Origin': '*',
  };
}
