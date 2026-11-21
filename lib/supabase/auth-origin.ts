import "server-only";

export function googleLoginEnabled() {
  return process.env.CARPOOL_GOOGLE_LOGIN === "true";
}

export function authOrigin() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(process.env.NEXT_PUBLIC_APP_URL || (vercel ? `https://${vercel}` : "http://127.0.0.1:4327")).origin;
}
