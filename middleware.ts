import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PROTECTED = ["/platform", "/org", "/member", "/scan"];

// Refresh the Supabase session on every protected page AND API request. Without
// the API matcher, an access token that expires while a page is open was never
// refreshed, so fetches started returning 401 until the user navigated again.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const isProtected = PROTECTED.some((p) => path.startsWith(p));
  if (!isApi && !isProtected) return NextResponse.next();

  const res = NextResponse.next();
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
    return NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(path), req.url));
  }
  return res;
}

export const config = {
  matcher: ["/platform/:path*", "/org/:path*", "/member/:path*", "/scan/:path*", "/api/:path*"],
};
