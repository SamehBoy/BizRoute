import { DateTime } from "luxon";
import type { PublicEvent } from "./domain";
import type { DetourLimit, Leg, Location, Trip } from "./matching/types";

const timezone = "America/Vancouver";
const place = (label: string, lat: number, lng: number): Location => ({ label, lat, lng });
// The fictional hall is pinned at the Vancouver Convention Centre West for the map demo.
const venue = place("Coal Harbour Hall, Vancouver", 49.2890, -123.1167);
const kitsCommunityCentre = place("Kitsilano Community Centre", 49.2637, -123.1610);
const kitsBeach = place("Kitsilano Beach", 49.2738, -123.1554);
const commercialBroadway = place("Commercial–Broadway Station", 49.2627, -123.0691);
const vanierPark = place("Vanier Park", 49.2763, -123.1449);
const scienceWorld = place("Science World", 49.2735, -123.1039);
const olympicVillage = place("Olympic Village Square", 49.2715, -123.1077);
const mountPleasant = place("Mount Pleasant Community Centre", 49.2642, -123.1003);
const troutLake = place("Trout Lake Community Centre", 49.2567, -123.0632);
const ubcRoseGarden = place("UBC Rose Garden", 49.2697, -123.2562);
const aquaticCentre = place("Vancouver Aquatic Centre", 49.2769, -123.1338);
const creekside = place("Creekside Community Centre", 49.2718, -123.1060);

type DemoTrip = Omit<Extract<Trip, { role: "DRIVER" }>, "id"> |
  Omit<Extract<Trip, { role: "PASSENGER" }>, "id">;
export type DemoPerson = { name: string; contact: string; trips: Trip[] };

export function demoFixture(start = "2027-06-12T17:30"): { event: PublicEvent; people: DemoPerson[] } {
  const starts = DateTime.fromISO(start, { zone: timezone });
  const ends = starts.plus({ hours: 3 });
  const event: PublicEvent = {
    name: "Saturday Social",
    organization_name: "Fictional example",
    description: "A fictional Vancouver get-together near the Coal Harbour waterfront. Sample drivers and passengers show how rides can be coordinated in both directions.",
    venue,
    starts_at: starts.toUTC().toISO()!,
    ends_at: ends.toUTC().toISO()!,
    timezone,
    registration_deadline: starts.minus({ hours: 3 }).toUTC().toISO()!,
    hubs: [aquaticCentre, creekside],
  };
  const leg = (direction: Leg, location: Location, seats?: number, detourLimit: DetourLimit = { unit: "minutes", value: 20 }, returnOffset = 0) => ({
    leg: direction,
    location,
    window: direction === "TO_EVENT"
      ? { earliest: starts.minus({ minutes: 65 }).toMillis() }
      : { earliest: ends.plus({ minutes: returnOffset }).toMillis(), latest: ends.plus({ minutes: returnOffset + 35 }).toMillis() },
    ...(seats ? { role: "DRIVER" as const, seats, detourLimit } : { role: "PASSENGER" as const }),
  });
  const out = (location: Location, seats?: number, detour?: DetourLimit) => leg("TO_EVENT", location, seats, detour);
  const back = (location: Location, seats?: number, detour?: DetourLimit, offset?: number) => leg("FROM_EVENT", location, seats, detour, offset);
  const person = (name: string, ...trips: DemoTrip[]) => ({
    name,
    contact: `${name.toLowerCase().replace(/[^a-z]/g, "")}@example.invalid`,
    trips: trips.map((trip, i) => ({ ...trip, id: `${name}-${i}` })),
  });
  return {
    event,
    people: [
      person("Maya Chen", out(kitsCommunityCentre, 3, { unit: "km", value: 6 }), back(kitsBeach, 2, { unit: "minutes", value: 15 })),
      person("Jordan Blake", out(commercialBroadway, 2, { unit: "minutes", value: 10 }), back(commercialBroadway)),
      person("Alex Rivera", out(kitsBeach), back(troutLake, 2, { unit: "minutes", value: 16 })),
      person("Priya Shah", out(vanierPark), back(vanierPark)),
      person("Sam Taylor", out(scienceWorld), back(mountPleasant)),
      person("Jamie Brooks", out(commercialBroadway), back(olympicVillage)),
      person("Morgan Reed", out(ubcRoseGarden), back(ubcRoseGarden, undefined, undefined, 120)),
      person("Charlie Wells", back(kitsBeach)),
    ],
  };
}

export function upcomingDemo() {
  const next = DateTime.now().setZone(timezone).plus({ days: 10 }).set({ hour: 17, minute: 30 });
  return demoFixture(next.toFormat("yyyy-MM-dd'T'HH:mm"));
}
