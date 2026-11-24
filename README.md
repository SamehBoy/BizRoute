# BizRoute
A carpool matching app for socials and events

BizRoute helps event organizers collect driver offers and ride requests, match trips in each direction, and share private ride links. Guests register without accounts. Drivers confirm or decline after reviewing their suggested route.

## Run locally

Use Node.js 22.13 or later. Node.js 24 LTS is suitable for deployment.

```sh
npm ci
npm run dev
```

Open [the interactive demo](http://127.0.0.1:4327/demo) to set up a fictional Vancouver event, try guest signup, approve the matches, and follow a driver’s route in Google Maps. The demo runs in the browser without Supabase credentials.

### Enable registration and organizer accounts

1. In the Supabase SQL Editor, apply the [initial schema](supabase/migrations/20261121000000_carpool.sql), [detour units](supabase/migrations/20261121010000_carpool_detour_km.sql), [ride coordination](supabase/migrations/20261121020000_carpool_coordination.sql), and [My ride](supabase/migrations/20261121030000_carpool_my_ride.sql) migrations in order. If the first three are already applied, run the My ride migration only. For a project whose migrations are tracked by the Supabase CLI, use `supabase db push`. [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
2. In Supabase Authentication, enable the email provider, allow new user sign-ups, and keep email confirmation enabled. Configure a custom SMTP sender for public delivery. In the authentication email templates, include `{{ .Token }}` in the **Magic Link** and **Confirm signup** templates so organizers get a code they can enter in BizRoute. Existing organizers can also sign in with their passwords. [Auth settings](https://supabase.com/docs/guides/auth/general-configuration) · [Email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
3. Copy `.env.example` to `.env.local`. Fill in the values below. Generate a unique ride-link secret with `openssl rand -hex 32`. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
4. To offer **Continue with Google**, create a Google OAuth client for public use, register the Supabase callback shown in the Google provider settings, and save the client ID and secret in Supabase. Allow your app's `/auth/callback` URL in Supabase Auth, set `NEXT_PUBLIC_APP_URL` to the app origin, and set `CARPOOL_GOOGLE_LOGIN=true`. [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
5. Restart the local server and sign in at [Organizer sign in](http://127.0.0.1:4327/login). Create an event or choose **Create sample event** to populate a persisted fictional event.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key, or the project's legacy anon key |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key, or legacy service-role key |
| `RIDE_LINK_SECRET` | Server-only, persistent 64-character hexadecimal value. Keep the same value across redeployments so the organizer can keep generating links that match the stored hashes. |
| `NEXT_PUBLIC_APP_URL` | Canonical app origin for copied links and Google sign-in callbacks. Set this to the production origin when enabling Google. |
| `CARPOOL_GOOGLE_LOGIN` | Optional. Set to `true` after enabling and configuring Google sign-in through Supabase. |
| `NEXT_PUBLIC_MAP_TILE_URL` | Optional HTTPS URL template for another OSM-compatible raster tile service |
| `NEXT_PUBLIC_MAP_TILE_CREDIT` | Optional extra attribution for the chosen tile service |

## Organizer walkthrough

1. Create an event with the schedule, time zone, and venue. Select points on the map or enter coordinates manually.
2. Copy the signup link. Guests enter their trip preferences and consent, then BizRoute opens their private **My ride** page for both directions. They can use the original event link in the same browser or save their private link for another device.
3. Open **Review matches** and generate a proposal for either direction. Each car shows assigned and offered seats, such as **2/3**. **Needs coordination** checks open seats, configured outbound pickup hubs, and availability changes of up to 30 minutes. For alternate pickups or timing, agree on the change with the rider, then choose **Add to carpool**. You can also fill a seat in an approved run while leaving confirmed cars and other assignments intact. The affected driver reviews their updated route before confirming it.
4. Approve the proposal. Guests can view the assignment in **My ride**. The participant roster provides a private fallback link if a guest loses access, and older registrations keep their per-trip links.
5. Drivers open Google Maps and confirm or decline from **My ride**. A decline removes shared details for that carpool, reveals its unmatched riders in the organizer view, and excludes the declined offer from subsequent proposals. Regeneration creates a draft. Approving a new draft replaces the live run for that leg and asks its drivers to respond again.
6. **Event settings** lets the organizer close registration or permanently delete the event and all its registrations, assignments, and access tokens.

Exact meetup times are coordinated by the carpool members. The app displays suggested driver departure times and shares contact details where participants provided them.

## How it works

- **Next.js App Router** serves the pages and server actions. React renders the responsive interface with Tailwind and an adapted shadcn/ui Button. Leaflet loads only in location pickers. [shadcn/ui Button](https://ui.shadcn.com/docs/components/radix/button)
- **Supabase Auth** verifies organizer sessions. Every administrative read and write scopes the event to the authenticated organizer. PostgreSQL tables have RLS enabled with direct access denied to anonymous and ordinary authenticated API roles. Server-only operations expose event metadata for signup and the approved ride for a specific trip.
- **PostgreSQL** stores participants, trip requests, access-token hashes, matching runs, assignments, and ordered stops. Event-scoped mutations use transactions and locks. Registration retries with the same submission ID are idempotent. One approved run per event and direction and one assignment per passenger per run enforce active-rider uniqueness. Historical runs and responses are retained until event deletion.
- **Private links** are derived with a server-side keyed hash. The database stores token hashes. One receipt covers the guest's own registration and both requested trips. A secure, HTTP-only cookie scoped to the original event page restores access in the same browser. Passengers see their own stop and assigned driver. Drivers see their approved route and assigned riders.
- **Matching** is a standalone TypeScript module. It evaluates insertion positions across several greedy passes, picks the plan with the most riders, and breaks ties on total geographic detour. Distance limits use extra straight-line kilometers. Time limits use a 35 km/h proxy plus two minutes per stop. Both estimates appear with each suggested route. The matcher checks that outbound pickup windows fit before the event starts and that return trips share a departure window. Drivers use Google Maps to inspect actual road routes before confirming.
- **Directions** use encoded Google Maps URLs, with a three-seat cap for mobile compatibility and segmentation support for longer route inputs. [Google Maps URLs reference](https://developers.google.com/maps/documentation/urls/get-started)

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The tests cover both directions, capacity and rider uniqueness, timing, inconvenient pickups, repeatability, navigation URL order, event isolation, ride privacy, approval and supersession, driver withdrawal, and event deletion. The database test runs the real migration in embedded PostgreSQL using PGlite and requires no service credentials.

## Deploy to Vercel

1. Push the source to a GitHub repository that your Vercel account can import. Import it as a Next.js project and select Node.js 24.x. [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
2. Add the four required environment variables above to Vercel's **Production** environment before deploying. Store the Supabase secret and ride-link secret as server-only variables. If you add or edit a variable after deployment, redeploy for the change to take effect. [Vercel environment variables](https://vercel.com/docs/environment-variables)
3. Set Supabase's **Auth Site URL** to the Vercel production domain. Add that domain's `/auth/callback` URL to the allowlist if using Google. Set `NEXT_PUBLIC_APP_URL` to the production origin and share signup links from that domain. [Supabase Auth URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
4. Sign in with a new organizer email and create an event. Open the signup link in a private browser window and submit a fictional driver registration. Check that **My ride** opens immediately and that the original event link restores access. Register a separate passenger, approve a match, then open the driving route and confirm from **My ride**.

Supabase Free includes a 500 MB database per project and is suitable for a small prototype. Projects can pause after inactivity. Vercel Hobby is for eligible personal, non-commercial use and has usage caps. The default OpenStreetMap tile service is best-effort and subject to its usage policy. Google Maps links require no API key. [Supabase pricing](https://supabase.com/pricing) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) · [Google Maps URLs](https://developers.google.com/maps/documentation/urls/quick-reference)

Manual reassignment, automated notifications, and road-based optimization are deferred. Organizer sign-in and real data collection require a configured Supabase project, and a hosted deployment requires Vercel access.
