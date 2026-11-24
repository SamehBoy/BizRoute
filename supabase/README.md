# Set up Supabase for BizRoute

Use your own Supabase project for organizer accounts and real events. The interactive demo at `/demo` runs in the browser with sample data.

## 1. Create a project and apply the migrations

Create a project in the [Supabase dashboard](https://supabase.com/dashboard). In that project's **SQL Editor**, open a new query for each file below. Run them in order and check each result before continuing.

1. [Initial event and matching schema](migrations/20261121000000_carpool.sql)
2. [Distance-based detour limits](migrations/20261121010000_carpool_detour_km.sql)
3. [Ride coordination and route versions](migrations/20261121020000_carpool_coordination.sql)
4. [Private My ride links](migrations/20261121030000_carpool_my_ride.sql)

On an existing BizRoute database, apply only the migrations that are missing. If you already track migrations through the Supabase CLI, use `supabase db push` from the repo root. The BizRoute server uses Supabase's Data API with server credentials. The migrations enable row-level security and restrict direct access to application tables and functions. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## 2. Configure the app

Copy [`.env.example`](../.env.example) to `.env.local` in the repo root. Get the project URL and keys from your Supabase project's **Connect** dialog or **Settings → API Keys**. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL, such as `https://your-project.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key. A legacy `anon` key also works. |
| `SUPABASE_SECRET_KEY` | The project's server-only secret key. A legacy `service_role` key also works. |
| `RIDE_LINK_SECRET` | A separate server-only signing secret. Generate it once with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_APP_URL` | The app's origin with no path, such as `http://127.0.0.1:4327` or `https://your-app.example`. |
| `CARPOOL_GOOGLE_LOGIN` | Set to `true` once you complete the Google setup below. |

Keep the two server-only values in `.env.local` or your host's secret settings. Use a different project and secrets for local development or previews that handle test data. Keep the production ride-link secret stable across redeploys so organizers can regenerate existing links. The optional `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_TILE_CREDIT` configure map tiles and attribution. Use a browser-safe tile URL because the map loads it on the client.

## 3. Enable organizer sign-in

Google sign-in is the simplest option for public organizer accounts. In Supabase, allow new user signups under **Authentication → Sign In / Providers**. Open the **Google** provider and copy the callback URL it displays. In Google Auth Platform, create a **Web application** OAuth client. [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

| Settings field | Value |
| --- | --- |
| Google **Authorized JavaScript origins** | Your BizRoute app origin. |
| Google **Authorized redirect URIs** | The Supabase callback from the provider settings, ending in `/auth/v1/callback`. |
| Supabase **Authentication → URL Configuration → Site URL** | Your BizRoute app origin. |
| Supabase **Redirect URLs** | The exact BizRoute callback, such as `https://your-app.example/auth/callback`. Use `http://127.0.0.1:4327/auth/callback` when testing locally. |

Save the Google client ID and client secret in Supabase's Google provider settings and enable the provider. Set `CARPOOL_GOOGLE_LOGIN=true` and restart the app. Add only the callback URLs you use. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

If you want organizer email codes, configure custom SMTP for public delivery and include `{{ .Token }}` in the **Magic Link** and **Confirm signup** templates. Supabase's built-in sender limits delivery to project team addresses. Guests use event links without organizer accounts. [Email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## 4. Configure production

Add the same variables to your Vercel project's **Production** environment. Set `NEXT_PUBLIC_APP_URL` to the public production origin and enable Vercel's **Sensitive** switch for the two server-only values. Update the Google and Supabase URLs above to match the production origin, then deploy again so the build picks up the configuration. [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

## 5. Check the setup

1. Sign in as an organizer and create a test event with a future registration deadline.
2. Open the signup link in a private browser window. Register as a driver, check that **My ride** opens, and verify that the original event link brings you back to it in that same window.
3. In a separate browser session, register a test passenger. Generate and approve a proposal, then open the route and confirm it from the driver's **My ride** page.
4. Check that the passenger can see their own pickup and driver, and that a different organizer account cannot open the event dashboard. Treat each **My ride** link as private because it grants access to that guest's ride details and, for drivers, their response controls.
