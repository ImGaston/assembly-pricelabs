import { validateClient } from '../../../../lib/auth.js';
import { fetchClientData } from '../../../../lib/pricelabs.js';
import { getClientReport } from '../../../../lib/reports.js';
import { getClientSeo } from '../../../../lib/seo.js';
import { getClientReservations, getListingReservations } from '../../../../lib/reservations.js';
import { generateMockDayOfWeekBuckets, generateMockReportData, generateMockReservations, generateMockSeoData } from '../../../../lib/mock-data.js';
import { buildDayOfWeek, getClientDayOfWeek } from '../../../../lib/day-of-week.js';
import { renderErrorPage, renderSetupPage } from '../../../../lib/render.js';
import { getLayout, isLayout } from '../../../../lib/layouts/index.js';
import { RESERVED_SLUGS } from '../../../../lib/clients.js';
import { isServingConfigured } from '../../../../lib/serving-db.js';
import { getServingListingById } from '../../../../lib/serving.js';
import { generateMockServingListing, generateMockServingPortfolio } from '../../../../lib/mock-serving.js';

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
  // Dashboard model. `?layout=` override works in dev (iterating on a new model
  // locally) and, in production, only on the hardcoded demos (mock data) — that
  // is what /admin/templates previews. Real clients and managed dashboards
  // always use the model from their row.
  const allowOverride = process.env.NODE_ENV !== 'production' || RESERVED_SLUGS.includes(slug);
  const layoutOverride = allowOverride && isLayout(url.searchParams.get('layout')) ? url.searchParams.get('layout') : null;
  const layoutKey = layoutOverride || auth.client.layout;
  const layout = getLayout(layoutKey);
  const { render } = layout;
  // Beta, non-standard and admin-managed links must not linger in the CDN.
  const cacheControl = auth.client.isManaged || auth.client.variant === 'beta' || (layoutKey && layoutKey !== 'standard')
    ? 'no-store'
    : 's-maxage=21600, stale-while-revalidate=3600';

  const isMock = !!(auth.client.useMockData && auth.client.demoListings);
  // The SEO tab of the standard model has its own empty state.
  const isStandardSeo = tab === 'seo' && !layout.load && !layout.singlePage;

  try {
    // A synthetic portfolio with no listings (unlinked managed dashboard).
    if (isMock && auth.client.demoListings.length === 0 && !isStandardSeo) {
      return setupResponse(auth.client, layout.key);
    }

    // Models with their own data source (e.g. pricelabs-report reads the
    // pricelabs-dashboard database). The model resolves ?listing= etc. itself.
    if (layout.load) {
      const loaded = await layout.load({ client: auth.client, dataClient, params: url.searchParams, isMock });
      if (loaded.empty) return setupResponse(auth.client, layout.key);
      if (loaded.error) {
        return new Response(renderErrorPage(loaded.error.status, loaded.error.message), { status: loaded.error.status, headers: responseHeaders() });
      }
      const { data, ...rest } = loaded;
      const html = render(auth.client, data, {
        ...rest,
        listing,
        view: url.searchParams.get('view'),
        date: url.searchParams.get('date'),
        res: url.searchParams.get('res'),
        others: url.searchParams.get('others'),
        layoutParam: layoutOverride,
      });
      return new Response(html, { status: 200, headers: { ...responseHeaders(), 'Cache-Control': cacheControl } });
    }

    // Single-page models (e.g. performance-report): pricing report + whatever
    // extra datasets the model declares in `needs`, rendered as one page.
    if (layout.singlePage) {
      const data = isMock
        ? generateMockReportData(auth.client.demoListings)
        : await getClientReport(dataClient);
      if (!data) return setupResponse(auth.client, layout.key);
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

      if (!data || !data.listings?.length) return setupResponse(auth.client, layout.key);
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

    // Drill-down Calendar sub-view: price calendar from the pricelabs-dashboard
    // DB. Optional — any miss or failure just hides the sub-view.
    const calendar = listing ? await loadListingCalendar(auth.client, dataClient, listing, url.searchParams) : null;

    const html = render(auth.client, data, {
      tab: 'pricing', seo: null, listing, reservations, calendar, view: url.searchParams.get('view'),
    });
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

async function loadListingCalendar(client, dataClient, listingId, params) {
  const detail = { date: params.get('date'), res: params.get('res'), others: params.get('others') };
  if (client.useMockData && client.demoListings) {
    const demo = client.demoListings.find((l) => String(l.listingId) === String(listingId));
    if (!demo) return null;
    return { listing: generateMockServingPortfolio([demo]).listings[0], ld: generateMockServingListing(demo), detail };
  }
  if (!isServingConfigured()) return null;
  try {
    const found = await getServingListingById(dataClient, listingId);
    return found ? { ...found, detail } : null;
  } catch (err) {
    console.error('Calendar load failed:', err.message);
    return null;
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

// New client with no data yet (no listings / no report rows): a branded 200, never
// a 500 — the Assembly Custom App shows every client the dashboard from day one.
// no-store so their numbers appear as soon as the first report lands.
function setupResponse(client, layoutKey) {
  console.info('dashboard empty state', { clientId: client.id, layout: layoutKey });
  return new Response(renderSetupPage(client), {
    status: 200,
    headers: { ...responseHeaders(), 'Cache-Control': 'no-store' },
  });
}

function responseHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'ALLOWALL',
    'Content-Security-Policy': 'frame-ancestors *',
    'Access-Control-Allow-Origin': '*',
  };
}
