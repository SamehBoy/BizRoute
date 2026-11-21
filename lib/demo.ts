import { DateTime } from "luxon";
import type { PublicEvent } from "./domain";
import type { DetourLimit, Leg, Location, Trip } from "./matching/types";

const venue = { lat: 47.6219, lng: -122.3506, label: "Seattle Center" };
const place = (label: string, lat: number, lng: number): Location => ({ label, lat, lng });
const ballard = place("Ballard Commons", 47.6685, -122.3838);
const capitol = place("Cal Anderson Park", 47.6171, -122.3190);
const fremont = place("Fremont Library", 47.6507, -122.3503);
const queenAnne = place("Kerry Park", 47.6294, -122.3599);
const southLake = place("South Lake Union Park", 47.6276, -122.3370);
const downtown = place("Westlake Center", 47.6115, -122.3370);
const volunteer = place("Volunteer Park", 47.6300, -122.3155);
const wallingford = place("Wallingford Playfield", 47.6569, -122.3368);
const madison = place("Madison Park", 47.6356, -122.2788);
const westSeattle = place("Alki Beach Park", 47.5819, -122.4076);
const greenLake = place("Green Lake Park", 47.6809, -122.3272);

type DemoTrip = Omit<Extract<Trip, { role: "DRIVER" }>, "id"> |
  Omit<Extract<Trip, { role: "PASSENGER" }>, "id">;
export type DemoPerson = { name: string; contact: string; trips: Trip[] };

export function demoFixture(start = "2027-06-12T17:30"): { event: PublicEvent; people: DemoPerson[] } {
  const timezone = "America/Los_Angeles";
  const starts = DateTime.fromISO(start, { zone: timezone });
  const ends = starts.plus({ hours: 3 });
  const event: PublicEvent = {
    name: "Saturday Social",
    organization_name: "Fictional example",
    description: "A fictional get-together at Seattle Center. The sample drivers and passengers show how different trips can be coordinated before and after an event.",
    venue,
    starts_at: starts.toUTC().toISO()!,
    ends_at: ends.toUTC().toISO()!,
    timezone,
    registration_deadline: starts.minus({ hours: 3 }).toUTC().toISO()!,
    hubs: [queenAnne, southLake],
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
      person("Maya Chen", out(ballard, 3, { unit: "km", value: 6 }), back(greenLake, 2, { unit: "minutes", value: 15 })),
      person("Jordan Blake", out(capitol, 2, { unit: "minutes", value: 10 }), back(downtown)),
      person("Alex Rivera", out(fremont), back(madison, 2, { unit: "minutes", value: 16 })),
      person("Priya Shah", out(queenAnne), back(wallingford)),
      person("Sam Taylor", out(southLake), back(volunteer)),
      person("Jamie Brooks", out(capitol), back(southLake)),
      person("Morgan Reed", out(westSeattle), back(westSeattle, undefined, undefined, 120)),
      person("Charlie Wells", back(greenLake)),
    ],
  };
}

export function upcomingDemo() {
  const next = DateTime.now().setZone("America/Los_Angeles").plus({ days: 10 }).set({ hour: 17, minute: 30 });
  return demoFixture(next.toFormat("yyyy-MM-dd'T'HH:mm"));
}
