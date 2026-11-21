import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { privateSupabase, publicSupabase } from "./config";

export function service() {
  const config = privateSupabase();
  if (!config) throw new Error("Supabase server configuration is missing");
  return createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
  });
}

export async function serverAuth() {
  const config = publicSupabase();
  if (!config) throw new Error("Supabase authentication configuration is missing");
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(items) {
        try {
          for (const { name, value, options } of items) jar.set(name, value, options);
        } catch {
          // Server Components are read-only. The proxy refreshes these cookies.
        }
      },
    },
  });
}

export const organizer = cache(async () => {
  if (!privateSupabase()) return null;
  const auth = await serverAuth();
  const { data } = await auth.auth.getUser();
  return data.user?.is_anonymous ? null : data.user;
});

export async function requireOrganizer() {
  const user = await organizer();
  if (!user) redirect("/login");
  return user;
}
