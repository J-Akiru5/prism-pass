import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { CSP_HEADER, buildSecurityHeaders } from "@/lib/security/headers";

const PROTECTED = ["/platform", "/org", "/member", "/scan"];

// Refresh the Supabase session on every protected page AND API request. Without
// the API matcher, an access token that expires while a page is open was never
// refreshed, so fetches started returning 401 until the user navigated again.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // One nonce per document request. Next reads the CSP request header and
  // stamps its own bootstrap scripts with this nonce; the response carries the
  // policy in Report-Only mode until a browser pass confirms every tag.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const security = buildSecurityHeaders({
    nonce,
    pathname: path,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    development: process.env.NODE_ENV !== "production",
  });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_HEADER, security.csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(security.enforced)) res.headers.set(name, value);

  const isApi = path.startsWith("/api/");
  const isProtected = PROTECTED.some((p) => path.startsWith(p));
  if (!isApi && !isProtected) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (pairs: { name: string; value: string; options?: CookieOptions }[]) =>
          pairs.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  // API routes answer with their own 401 JSON envelope; only pages redirect.
  if (!isApi && !data.user) {
    const redirect = NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(path), req.url));
    for (const [name, value] of Object.entries(security.enforced)) redirect.headers.set(name, value);
    return redirect;
  }
  return res;
}

// Security headers must reach every document, not only protected routes.
// Static assets and the image optimiser are excluded: they carry no document
// policy and adding a per-request nonce there would waste middleware invocations.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
