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

Follow the [Supabase setup guide](supabase/README.md) to create your own project, apply the migrations, and set up organizer sign-in. Configuration starts from [`.env.example`](.env.example).

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
2. Follow the [production configuration](supabase/README.md#4-configure-production) and [end-to-end check](supabase/README.md#5-check-the-setup) in the Supabase guide.

Supabase Free includes a 500 MB database per project and is suitable for a small prototype. Projects can pause after inactivity. Vercel Hobby is for eligible personal, non-commercial use and has usage caps. The default OpenStreetMap tile service is best-effort and subject to its usage policy. Google Maps links require no API key. [Supabase pricing](https://supabase.com/pricing) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) · [Google Maps URLs](https://developers.google.com/maps/documentation/urls/quick-reference)

Manual reassignment, automated notifications, and road-based optimization are deferred. Organizer sign-in and real data collection require a configured Supabase project, and a hosted deployment requires Vercel access.
