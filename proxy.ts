import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabase } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const config = publicSupabase();
  let response = NextResponse.next({ request });
  if (!config) return response;

  const auth = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  await auth.auth.getClaims();
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/login"] };
