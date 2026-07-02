import { validateClient } from '../../../../lib/auth.js';
import { fetchClientData } from '../../../../lib/pricelabs.js';
import { getClientReport } from '../../../../lib/reports.js';
import { getClientSeo } from '../../../../lib/seo.js';
import { generateMockReportData, generateMockSeoData } from '../../../../lib/mock-data.js';
import { renderDashboard, renderErrorPage } from '../../../../lib/render.js';

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

  try {
    // SEO Visibility tab — a parallel view keyed off the same client/auth. A null
    // result (no SEO coverage) still renders 200 as an empty state.
    if (tab === 'seo') {
      const seo =
        auth.client.useMockData && auth.client.demoListings
          ? generateMockSeoData(auth.client.demoListings)
          : await getClientSeo(auth.client);

      const html = renderDashboard(auth.client, null, { tab: 'seo', seo, listing });
      const isEmpty = !seo || !seo.listings || seo.listings.length === 0;

      return new Response(html, {
        status: 200,
        headers: {
          ...responseHeaders(),
          'Cache-Control': isEmpty
            ? 'no-store'
            : 's-maxage=21600, stale-while-revalidate=3600',
        },
      });
    }

    let data;
    if (auth.client.useMockData && auth.client.demoListings) {
      data = generateMockReportData(auth.client.demoListings);
    } else {
      // Primary source: the Hub's daily PriceLabs report (Supabase).
      data = await getClientReport(auth.client);

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
    const html = renderDashboard(auth.client, data, { tab: 'pricing', seo: null, listing });
    const isEmpty = !data.listings || data.listings.length === 0;

    return new Response(html, {
      status: 200,
      headers: {
        ...responseHeaders(),
        'Cache-Control': isEmpty
          ? 'no-store'
          : 's-maxage=21600, stale-while-revalidate=3600',
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

function responseHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'ALLOWALL',
    'Content-Security-Policy': 'frame-ancestors *',
    'Access-Control-Allow-Origin': '*',
  };
}
