import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { roleOf, canAccess, homeFor } from './lib/roles';

// Runs before every request. Refreshes the Supabase session cookie, and
// redirects to /login if the person isn't signed in and isn't already
// heading to /login or a static asset.
export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith('/login');
  // Public, tokenised client pages and their read/accept APIs need no sign-in —
  // the token in the URL is the capability. Creating an invoice
  // (POST /api/invoices, which has no token segment) stays protected.
  const isPublicInvoice =
    pathname.startsWith('/i/') ||
    /^\/api\/invoices\/[^/]+(?:\/accept)?\/?$/.test(pathname);
  // Growth system, public side: tracked short links, the enquiry page and its
  // APIs, the privacy notice, and the set-password page an invite lands on.
  // Scheduled jobs and the Meta webhook check their own secret/signature.
  const isPublicGrowth =
    /^\/go\/[^/]+\/?$/.test(pathname) ||
    /^\/(enquire|privacy|welcome)(\/|$)/.test(pathname) ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/meta/webhook';
  const isPublic = isLoginPage || isPublicInvoice || isPublicGrowth;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const role = roleOf(user);

  if (user && isLoginPage) {
    // A signed-in account with no access stays on the login page (with a
    // message and a sign-out) rather than bouncing between pages forever.
    if (role === 'none') return response;
    const url = request.nextUrl.clone();
    url.pathname = homeFor(role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Role check for everything that isn't public. Marketing only gets the
  // Growth workspace; an account with no role gets nothing.
  if (user && !isPublic && !canAccess(role, pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Your login doesn’t have access to this.' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = role === 'none' ? '/login' : homeFor(role);
    url.search = role === 'none' ? '?e=noaccess' : '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // The image-extension skip above must never apply to the API: without
    // this, /api/enquiries/<id>%23.png bypassed the login and role checks.
    '/api/:path*',
  ],
};
