import { validateClient } from '../../../../lib/auth.js';
import { fetchClientData } from '../../../../lib/pricelabs.js';
import { getClientReport } from '../../../../lib/reports.js';
import { generateMockReportData } from '../../../../lib/mock-data.js';
import { renderDashboard, renderErrorPage } from '../../../../lib/render.js';

/**
 * GET /api/dashboard/[slug]?token=xxx
 * Returns a fully server-rendered HTML dashboard page.
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  const token = new URL(request.url).searchParams.get('token');

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
    const html = renderDashboard(auth.client, data);
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
