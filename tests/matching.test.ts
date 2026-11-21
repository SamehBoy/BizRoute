import assert from "node:assert/strict";
import { test } from "node:test";
import { demoFixture } from "../lib/demo";
import { eventTiming, engineTrip, type TripRow } from "../lib/domain";
import { googleMapsLinks } from "../lib/google-maps";
import { explainUnmatched, matchTrips, suggestCoordination } from "../lib/matching";
import { estimateDetourMinutes, haversineKm } from "../lib/matching/distance";
import type { Leg, Location, Trip } from "../lib/matching/types";
import { readLocal } from "../lib/time";

const hour = 3_600_000;
const minute = 60_000;
const point = (label: string, lng: number, lat = 0): Location => ({ label, lat, lng });
const venue = point("Venue", 0);
const event = { venue, startsAt: 18 * hour, endsAt: 20 * hour };
const driver = (id: string, seats: number, location = point("West", -0.1), leg: Leg = "TO_EVENT"): Extract<Trip, { role: "DRIVER" }> => ({
  id, leg, location, role: "DRIVER", seats, detourLimit: { unit: "minutes", value: 16 },
  window: { earliest: (leg === "TO_EVENT" ? 17 : 20) * hour },
});
const passenger = (id: string, location = point("Library", -0.06), leg: Leg = "TO_EVENT"): Trip => ({
  id, location, leg, role: "PASSENGER", window: { earliest: (leg === "TO_EVENT" ? 17 : 20) * hour },
});

test("reports each passenger when there are no drivers, including zero-seat offers", () => {
  for (const drivers of [[], [driver("zero", 0)]]) {
    const result = matchTrips("TO_EVENT", event, [...drivers, passenger("one"), passenger("two")]);
    assert.deepEqual(result, { routes: [], unmatchedIds: ["one", "two"], matched: 0, extraKm: 0 });
  }
});

test("returns no assignments when there are no passengers", () => {
  assert.deepEqual(matchTrips("TO_EVENT", event, [driver("one", 2)]),
    { routes: [], unmatchedIds: [], matched: 0, extraKm: 0 });
});

test("caps loads, assigns each rider once, and reports excess demand", () => {
  const result = matchTrips("TO_EVENT", event, [
    driver("1", 1), driver("2", 2), ...["a", "b", "c", "d", "e"].map((id) => passenger(id)),
  ]);
  assert.equal(result.matched, 3);
  const picked = result.routes.flatMap(({ stops }) => stops.map((stop) => stop.passengerId));
  assert.equal(new Set(picked).size, 3);
  assert.equal(result.unmatchedIds.length, 2);
  assert.ok(result.unmatchedIds.every((id) => !picked.includes(id)));
  for (const route of result.routes) assert.ok(route.stops.length <= Number(route.driverId));
});

test("rejects geographically inconvenient pickups using the detour proxy", () => {
  const result = matchTrips("TO_EVENT", event, [
    driver("main", 3), passenger("north", point("North", 0, 1)), passenger("south", point("South", 0, -1)),
  ]);
  assert.deepEqual(result.unmatchedIds, ["north", "south"]);
});

test("distance limits use extra kilometers while time limits include stop time", () => {
  const offer = driver("main", 1);
  const distanceOffer = { ...offer, detourLimit: { unit: "km" as const, value: 0 } };
  const timeOffer = { ...offer, detourLimit: { unit: "minutes" as const, value: 1 } };
  const onRoute = passenger("on-route");
  const offRoute = passenger("off-route", point("Nearby stop", -0.06, 0.01));

  assert.equal(matchTrips("TO_EVENT", event, [distanceOffer, onRoute]).matched, 1);
  assert.equal(matchTrips("TO_EVENT", event, [timeOffer, onRoute]).matched, 0);
  assert.equal(explainUnmatched("TO_EVENT", event, [timeOffer, onRoute], []).get(onRoute.id), "DETOUR");
  assert.equal(matchTrips("TO_EVENT", event, [distanceOffer, offRoute]).matched, 0);
  assert.equal(matchTrips("TO_EVENT", event, [offer, offRoute]).matched, 1);
  assert.equal(estimateDetourMinutes(3.5, 2), 10);
});

test("driver offers read legacy minute limits and zero-kilometer limits", () => {
  const trip: TripRow = {
    id: "driver", event_id: "event", participant_id: "person", leg: "TO_EVENT", role: "DRIVER",
    location: point("West", -0.1), earliest_at: "2026-11-21T17:00:00Z", latest_at: null, seats: 2, detour_minutes: 15,
  };
  const legacy = engineTrip(trip);
  const distance = engineTrip({ ...trip, detour_minutes: null, detour_km: 0 });
  assert.equal(legacy.role, "DRIVER");
  assert.deepEqual(legacy.detourLimit, { unit: "minutes", value: 15 });
  assert.equal(distance.role, "DRIVER");
  assert.deepEqual(distance.detourLimit, { unit: "km", value: 0 });
});

test("optimizes stop order for multiple riders near a driver's route", () => {
  const result = matchTrips("TO_EVENT", event, [
    driver("main", 3), passenger("closest to venue", point("Last", -0.02)),
    passenger("closest to driver", point("First", -0.08)), passenger("middle", point("Middle", -0.05)),
  ]);
  assert.equal(result.matched, 3);
  assert.deepEqual(result.routes[0].stops.map((stop) => stop.location.label), ["First", "Middle", "Last"]);
  assert.ok(result.extraKm < 1e-8);
});

test("keeps independent locations and one-direction-only trips", () => {
  const returning = "FROM_EVENT";
  const destination = point("Driver home", 0.09);
  const dropoff = point("Different evening stop", 0.07);
  const trips = [
    driver("out-driver", 2), passenger("person-out"), passenger("only-out"),
    driver("return-driver", 2, destination, returning), passenger("person-return", dropoff, returning),
  ];
  const out = matchTrips("TO_EVENT", event, trips);
  const back = matchTrips(returning, event, trips);
  assert.equal(out.matched, 2);
  assert.equal(back.matched, 1);
  assert.deepEqual(out.routes[0].destination, venue);
  assert.deepEqual(back.routes[0].origin, venue);
  assert.deepEqual(back.routes[0].destination, destination);
  assert.deepEqual(back.routes[0].stops[0].location, dropoff);
});

test("checks outbound availability and return window intersections", () => {
  const late = { ...passenger("late"), window: { earliest: event.startsAt - minute } };
  const early = { ...passenger("early"), window: { earliest: 17 * hour, latest: 17.5 * hour } };
  const out = matchTrips("TO_EVENT", event, [driver("main", 2), late, early]);
  assert.deepEqual(out.unmatchedIds, ["late"]);
  assert.ok(out.routes[0].departureAt < 17.5 * hour);

  const leg = "FROM_EVENT";
  const returnDriver = { ...driver("main", 2, point("Home", 0.1), leg),
    window: { earliest: event.endsAt, latest: event.endsAt + 15 * minute } };
  const returnRider = { ...passenger("high", point("Close", 0.08), leg), window: { earliest: event.endsAt + 30 * minute } };
  assert.deepEqual(matchTrips(leg, event, [returnDriver, returnRider]).unmatchedIds, ["high"]);
});

test("runs repeat deterministically, and excludes declined drivers when rerun", () => {
  const trips = [driver("b", 2), passenger("2"), driver("a", 2), passenger("1")];
  const first = matchTrips("TO_EVENT", event, trips);
  assert.deepEqual(first, matchTrips("TO_EVENT", event, [...trips].reverse()));
  const next = matchTrips("TO_EVENT", event, trips, { excludedDrivers: new Set([first.routes[0].driverId]) });
  assert.equal(next.matched, 2);
  assert.notEqual(next.routes[0].driverId, first.routes[0].driverId);
});

test("unmatched explanations identify full compatible cars even when other cars have seats", () => {
  const trips = [
    driver("near", 1), driver("far", 2, point("East", 0.1)),
    passenger("first"), passenger("second"),
  ];
  const result = matchTrips("TO_EVENT", event, trips);
  const reasons = explainUnmatched("TO_EVENT", event, trips, result.routes);
  assert.equal(result.matched, 1);
  assert.equal(reasons.size, 1);
  assert.equal(reasons.get(result.unmatchedIds[0]), "CAPACITY");
});

test("unmatched explanations distinguish detour, timing, and unavailable offers", () => {
  const leg = "FROM_EVENT";
  const rider = {
    ...passenger("rider", point("East", 0.08), leg),
    window: { earliest: event.endsAt, latest: event.endsAt + 20 * minute },
  };
  const near = driver("near", 1, point("East", 0.1), leg);
  const far = driver("far", 1, point("West", -0.1), leg);
  const late = { ...near, window: { earliest: event.endsAt + 45 * minute } };
  assert.equal(explainUnmatched(leg, event, [far, rider], []).get(rider.id), "DETOUR");
  assert.equal(explainUnmatched(leg, event, [late, rider], []).get(rider.id), "TIMING");
  assert.equal(explainUnmatched(leg, event, [far, late, rider], []).get(rider.id), "TIMING_OR_DETOUR");
  assert.equal(explainUnmatched(leg, event, [near, rider], []).get(rider.id), "OPEN_SEAT");
  assert.equal(explainUnmatched(leg, event, [near, rider, driver("outbound", 1)], [],
    { excludedDrivers: new Set([near.id]) }).get(rider.id), "NO_DRIVERS");
});

test("coordination finds a feasible pickup hub and preserves the existing stop order", () => {
  const offer = driver("driver", 3);
  const first = passenger("first", point("First", -0.08));
  const second = passenger("second", point("Second", -0.03));
  const waiting = passenger("waiting", point("Far away", -0.06, 0.5));
  const trips = [offer, first, second, waiting];
  const { routes } = matchTrips("TO_EVENT", event, trips);
  const hubs = [point("Accessible hub", -0.06)];
  const [suggestion] = suggestCoordination("TO_EVENT", event, trips, routes, { hubs }).get(waiting.id)!;
  assert.deepEqual(suggestion.change, { kind: "HUB", hubIndex: 0 });
  assert.equal(suggestion.stopIndex, 2);
  assert.equal(suggestion.route.stops[1].location.label, "Accessible hub");
  assert.deepEqual(suggestion.route.stops.filter(({ passengerId }) => passengerId !== waiting.id), routes[0].stops);
  assert.deepEqual(routes[0].stops.map(({ passengerId }) => passengerId), ["first", "second"]);
  assert.equal(suggestCoordination("TO_EVENT", event, trips, routes, {
    hubs, lockedDrivers: new Set([offer.id]),
  }).get(waiting.id)?.[0]?.locked, true);
  assert.equal(suggestCoordination("TO_EVENT", event, [{ ...offer, seats: 2 }, first, second, waiting], routes, { hubs }).size, 0);
});

test("coordination suggests the smallest tested departure change that fits a return ride", () => {
  const leg = "FROM_EVENT";
  const offer = { ...driver("driver", 1, point("East", 0.1), leg),
    window: { earliest: event.endsAt + 12 * minute, latest: event.endsAt + 25 * minute } };
  const waiting = { ...passenger("waiting", point("Library", 0.06), leg),
    window: { earliest: event.endsAt, latest: event.endsAt + 3 * minute } };
  const [suggestion] = suggestCoordination(leg, event, [offer, waiting], []).get(waiting.id)!;
  assert.deepEqual(suggestion.change, { kind: "TIMING", shiftMinutes: 10 });
  assert.equal(suggestion.route.departureAt, event.endsAt + 12 * minute);
  assert.equal(suggestion.route.stops[0].shiftMinutes, 10);
  assert.equal(waiting.window.earliest, event.endsAt);
});

test("the demo has matched and unmatched riders in both directions", () => {
  const { event, people } = demoFixture();
  const trips = people.flatMap((person) => person.trips);
  const out = matchTrips("TO_EVENT", eventTiming(event), trips);
  const back = matchTrips("FROM_EVENT", eventTiming(event), trips);
  for (const run of [out, back]) {
    assert.ok(run.matched > 0 && run.unmatchedIds.length > 0);
    assert.equal(run.routes.length, 2);
  }
  assert.notDeepEqual(out.routes.map((route) => route.driverId), back.routes.map((route) => route.driverId));
});

test("Haversine uses the short path across the antimeridian", () => {
  assert.ok(Math.abs(haversineKm(point("A", 179.5), point("B", -179.5)) - 111.2) < .1);
});

test("navigation preserves every stop and segments routes beyond the mobile limit", () => {
  const [a, b, c, d, e, f, g] = [0, 1, 2, 3, 4, 5, 6].map((longitude) => point(String(longitude), longitude));
  const [first, second] = googleMapsLinks(a, [b, c, d, e, f], g).map((link) => new URL(link));
  assert.equal(first.origin, "https://www.google.com");
  assert.equal(first.pathname, "/maps/dir/");
  assert.equal(first.searchParams.get("api"), "1");
  assert.equal(first.searchParams.get("travelmode"), "driving");
  assert.equal(first.searchParams.get("waypoints"), "0.000000,1.000000|0.000000,2.000000|0.000000,3.000000");
  assert.equal(first.searchParams.get("origin"), "0.000000,0.000000");
  assert.equal(first.searchParams.get("destination"), second.searchParams.get("origin"));
  assert.equal(second.searchParams.get("waypoints"), "0.000000,5.000000");
  assert.equal(second.searchParams.get("destination"), "0.000000,6.000000");
  assert.ok(first.href.length < 2048 && second.href.length < 2048);
});

test("converts event-local times and rejects missing or ambiguous DST hours", () => {
  assert.equal(readLocal("2027-06-12T17:30", "America/Los_Angeles"), "2027-06-13T00:30:00.000Z");
  assert.equal(readLocal("2027-03-14T02:30", "America/Los_Angeles"), null);
  assert.equal(readLocal("2027-11-07T01:30", "America/Los_Angeles"), null);
});
