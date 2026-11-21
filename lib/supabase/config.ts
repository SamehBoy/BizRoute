export function publicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function privateSupabase() {
  const config = publicSupabase();
  const key = process.env.SUPABASE_SECRET_KEY;
  const rideSecret = process.env.RIDE_LINK_SECRET;
  return config && key && rideSecret && /^[a-f0-9]{64}$/i.test(rideSecret)
    ? { url: config.url, key, rideSecret }
    : null;
}
