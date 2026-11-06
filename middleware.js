import { NextResponse } from 'next/server';
import { verifyAssemblyInternalUser } from './lib/assembly-auth.js';
import { EMBED_COOKIE, EMBED_HEADER, EMBED_MAX_AGE, signEmbedSession } from './lib/admin-embed-session.js';

// /admin opened as the Assembly Custom App's Internal-facing URL: Assembly
// appends `?token=<encrypted>`. A token that resolves to a real internal user
// signs the request in (request header for this render) and sets a partitioned
// third-party cookie so later navigation inside the iframe stays signed in.
export async function middleware(request) {
  const headers = new Headers(request.headers);
  headers.delete(EMBED_HEADER); // never trust a client-sent identity header

  const token = request.nextUrl.searchParams.get('token');
  const user = token ? await verifyAssemblyInternalUser(token) : null;
  if (user) headers.set(EMBED_HEADER, encodeURIComponent(user.email || user.name || user.id));

  const response = NextResponse.next({ request: { headers } });
  if (user) {
    const value = await signEmbedSession(user.email || user.name || user.id);
    if (value) {
      // Set-Cookie by hand: Next 14's cookie helper has no `Partitioned` flag.
      response.headers.append('Set-Cookie',
        `${EMBED_COOKIE}=${value}; Path=/admin; Max-Age=${EMBED_MAX_AGE}; HttpOnly; Secure; SameSite=None; Partitioned`);
    }
  }
  return response;
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
