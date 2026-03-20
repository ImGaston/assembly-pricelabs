import { validateClient } from '../../../../lib/auth.js';
import { fetchClientData, fetchClientDataByGroup } from '../../../../lib/pricelabs.js';
import { renderDashboard, renderErrorPage } from '../../../../lib/render.js';

/**
 * GET /api/dashboard/[slug]?token=xxx
 * Returns a fully server-rendered HTML dashboard page.
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  const token = new URL(request.url).searchParams.get('token');

  // Validate client
  const auth = validateClient(slug, token);

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

  // Fetch data and render
  try {
    let data;
    if (auth.client.priceLabsGroup) {
      data = await fetchClientDataByGroup(
        auth.client.priceLabsGroup,
        auth.client.nameOverrides || {}
      );
    } else if (auth.client.listings) {
      data = await fetchClientData(auth.client.listings);
    } else {
      return new Response(
        renderErrorPage(500, 'no listings configured'),
        { status: 500, headers: responseHeaders() }
      );
    }
    const html = renderDashboard(auth.client, data);

    return new Response(html, {
      status: 200,
      headers: {
        ...responseHeaders(),
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600',
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
