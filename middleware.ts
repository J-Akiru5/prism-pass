import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
const PROTECTED = ["/platform", "/org", "/member", "/scan"];
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PROTECTED.some((p) => path.startsWith(p))) return NextResponse.next();
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: (pairs: { name: string; value: string; options?: CookieOptions }[]) => pairs.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) } }
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login?next=" + encodeURIComponent(path), req.url));
  return res;
}
export const config = { matcher: ["/platform/:path*", "/org/:path*", "/member/:path*", "/scan/:path*"] };
