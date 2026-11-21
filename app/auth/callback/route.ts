import { type NextRequest, NextResponse } from "next/server";
import { organizerDestination, organizerLoginPath } from "@/lib/organizer-destination";
import { authOrigin, googleLoginEnabled } from "@/lib/supabase/auth-origin";
import { privateSupabase } from "@/lib/supabase/config";
import { serverAuth } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const destination = organizerDestination(searchParams.get("next"));
  const code = searchParams.get("code");
  if (code && privateSupabase() && googleLoginEnabled()) {
    const auth = await serverAuth();
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, authOrigin()), 303);
  }
  const login = new URL(organizerLoginPath(destination), authOrigin());
  login.searchParams.set("auth_failed", "1");
  return NextResponse.redirect(login, 303);
}
