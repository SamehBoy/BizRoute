import { estimateDetourMinutes, haversineKm, MINUTE, STOP_MINUTES, travelMs, type Distance } from "./distance";
import type { CoordinationChange, CoordinationSuggestion, EventTiming, Leg, Location, MatchResult, Route, Trip, UnmatchedReason, Window } from "./types";

export const SOLVER_VERSION = "insertion-2";
type Driver = Extract<Trip, { role: "DRIVER" }>;
type Passenger = Extract<Trip, { role: "PASSENGER" }> & { shiftMinutes?: number };
type Car = { driver: Driver; origin: Location; destination: Location; directKm: number; stops: Passenger[]; route?: Route };
type Candidate = { car: Car; passenger: Passenger; stops: Passenger[]; route: Route; addedKm: number };
type MatchOptions = { excludedDrivers?: ReadonlySet<string>; distance?: Distance };

function intersect(window: Window, offset = 0): [number, number] {
  return [window.earliest - offset, (window.latest ?? Infinity) - offset];
}

function measureRoute(car: Car, stops: Passenger[], event: EventTiming, distance: Distance) {
  const outbound = car.driver.leg === "TO_EVENT";
  const bounds = [intersect(car.driver.window)];
  let km = 0;
  let previous = car.origin;

  for (const [index, stop] of stops.entries()) {
    km += distance(previous, stop.location);
    bounds.push(intersect(stop.window, outbound ? travelMs(km) + index * STOP_MINUTES * MINUTE : 0));
    previous = stop.location;
  }
  km += distance(previous, car.destination);
  const extraKm = Math.max(0, km - car.directKm);
  const dwell = stops.length * STOP_MINUTES * MINUTE;
  bounds.push(outbound ? [-Infinity, event.startsAt - travelMs(km) - dwell] : [event.endsAt, Infinity]);

  const first = Math.max(...bounds.map(([start]) => start));
  const last = Math.min(...bounds.map(([, end]) => end));
  const limit = car.driver.detourLimit;
  const detour = limit.unit === "km" ? extraKm : estimateDetourMinutes(extraKm, stops.length);
  return {
    extraKm,
    departureAt: Math.round(outbound ? last : first),
    fitsDetour: detour <= limit.value + 1e-7,
    fitsTiming: first <= last,
  };
}

function score(car: Car, stops: Passenger[], event: EventTiming, distance: Distance): Route | undefined {
  const { extraKm, departureAt, fitsDetour, fitsTiming } = measureRoute(car, stops, event, distance);
  if (!fitsDetour || !fitsTiming) return;
  return {
    driverId: car.driver.id,
    origin: car.origin,
    destination: car.destination,
    stops: stops.map(({ id, location, shiftMinutes }) => shiftMinutes
      ? { passengerId: id, location, shiftMinutes } : { passengerId: id, location }),
    extraKm,
    departureAt,
  };
}

function availableDrivers(leg: Leg, trips: readonly Trip[], excluded?: ReadonlySet<string>) {
  return trips.filter((trip): trip is Driver =>
    trip.leg === leg && trip.role === "DRIVER" && trip.seats > 0 && !excluded?.has(trip.id));
}

function baseCar(driver: Driver, venue: Location, distance: Distance): Car {
  const [origin, destination] = driver.leg === "TO_EVENT" ? [driver.location, venue] : [venue, driver.location];
  return { driver, origin, destination, directKm: distance(origin, destination), stops: [] };
}

export function matchTrips(
  leg: Leg,
  event: EventTiming,
  trips: readonly Trip[],
  options: MatchOptions = {},
): MatchResult {
  const ordered = [...trips].sort((a, b) => a.id.localeCompare(b.id));
  const drivers = availableDrivers(leg, ordered, options.excludedDrivers);
  const passengers = ordered.filter((trip): trip is Passenger => trip.leg === leg && trip.role === "PASSENGER");
  const estimate = options.distance ?? haversineKm;
  const locations = [event.venue, ...ordered.map((trip) => trip.location)];
  const ids = new Map(locations.map((location, index) => [location, index]));
  const cache = new Map<number, number>();
  const distance: Distance = (a, b) => {
    const key = ids.get(a)! * locations.length + ids.get(b)!;
    const value = cache.get(key) ?? estimate(a, b);
    cache.set(key, value);
    return value;
  };

  function solve(strategy: "closest" | "fewest-drivers" | "reverse"): MatchResult {
    const cars = drivers.map((driver) => baseCar(driver, event.venue, distance));
    const waiting = new Map(passengers.map((passenger) => [passenger.id, passenger]));
    while (waiting.size) {
      const choices: Candidate[] = [];
      const counts = new Map<string, number>();
      for (const passenger of waiting.values()) {
        for (const car of cars) {
          if (car.stops.length >= car.driver.seats) continue;
          let best: Candidate | undefined;
          for (let index = 0; index <= car.stops.length; index += 1) {
            const stops = car.stops.toSpliced(index, 0, passenger);
            const route = score(car, stops, event, distance);
            if (!route) continue;
            const addedKm = route.extraKm - (car.route?.extraKm ?? 0);
            if (!best || addedKm < best.addedKm - 1e-8) best = { passenger, car, stops, route, addedKm };
          }
          if (!best) continue;
          choices.push(best);
          counts.set(passenger.id, (counts.get(passenger.id) ?? 0) + 1);
        }
      }
      const [best] = choices.sort((a, b) => {
        const scarcity = strategy === "fewest-drivers" ? counts.get(a.passenger.id)! - counts.get(b.passenger.id)! : 0;
        const order = a.passenger.id.localeCompare(b.passenger.id) || a.car.driver.id.localeCompare(b.car.driver.id);
        return scarcity || (Math.abs(a.addedKm - b.addedKm) > 1e-8 ? a.addedKm - b.addedKm : 0) ||
          (strategy === "reverse" ? -order : order);
      });
      if (!best) break;
      best.car.stops = best.stops;
      best.car.route = best.route;
      waiting.delete(best.passenger.id);
    }

    const routes = cars.flatMap((car) => car.route ? [car.route] : []);
    return {
      routes,
      unmatchedIds: [...waiting.keys()],
      matched: passengers.length - waiting.size,
      extraKm: routes.reduce((sum, route) => sum + route.extraKm, 0),
    };
  }

  return [solve("closest"), solve("fewest-drivers"), solve("reverse")]
    .sort((a, b) => b.matched - a.matched || a.extraKm - b.extraKm)[0];
}

function shiftPassenger(passenger: Passenger, shiftMinutes: number): Passenger {
  if (shiftMinutes === 0) return passenger;
  const delta = shiftMinutes * MINUTE;
  const { earliest, latest } = passenger.window;
  return { ...passenger, shiftMinutes, window: { earliest: earliest + delta, latest: latest == null ? undefined : latest + delta } };
}

function carpoolState(
  leg: Leg,
  event: EventTiming,
  trips: readonly Trip[],
  activeRoutes: readonly Pick<Route, "driverId" | "stops">[],
  options: MatchOptions,
) {
  const distance = options.distance ?? haversineKm;
  const passengers = new Map(trips.flatMap((trip) =>
    trip.leg === leg && trip.role === "PASSENGER" ? [[trip.id, trip] as const] : []));
  const routes = new Map(activeRoutes.map((route) => [route.driverId, route]));
  const seated = new Set(activeRoutes.flatMap((route) => route.stops.map((stop) => stop.passengerId)));
  const cars = availableDrivers(leg, trips, options.excludedDrivers).map((driver) => {
    const car = baseCar(driver, event.venue, distance);
    car.stops = routes.get(driver.id)?.stops.flatMap(({ passengerId, location, shiftMinutes }) => {
      const rider = passengers.get(passengerId);
      return rider ? [shiftPassenger({ ...rider, location }, shiftMinutes ?? 0)] : [];
    }) ?? [];
    return car;
  });
  return { distance, passengers, seated, cars };
}

export function explainUnmatched(
  leg: Leg,
  event: EventTiming,
  trips: readonly Trip[],
  activeRoutes: readonly Pick<Route, "driverId" | "stops">[],
  options: MatchOptions = {},
): Map<string, UnmatchedReason> {
  const { distance, passengers, seated, cars } = carpoolState(leg, event, trips, activeRoutes, options);

  function explain(passenger: Passenger): UnmatchedReason {
    if (!cars.length) return "NO_DRIVERS";
    let compatibleCarIsFull = false;
    let fitsAnyDetour = false;
    let fitsAnyTiming = false;

    for (const car of cars) {
      const full = car.stops.length >= car.driver.seats;
      const candidates = car.stops.map((_, index) => car.stops.toSpliced(index, 0, passenger));
      candidates.push([...car.stops, passenger]);
      // A full car may still be a useful outreach lead if the rider would fit on its own.
      if (full) candidates.push([passenger]);
      for (const stops of candidates) {
        const { fitsDetour, fitsTiming } = measureRoute(car, stops, event, distance);
        fitsAnyDetour ||= fitsDetour;
        fitsAnyTiming ||= fitsTiming;
        if (!fitsDetour || !fitsTiming) continue;
        if (!full) return "OPEN_SEAT";
        compatibleCarIsFull = true;
      }
    }

    if (compatibleCarIsFull) return "CAPACITY";
    if (!fitsAnyDetour) return "DETOUR";
    if (!fitsAnyTiming) return "TIMING";
    return "TIMING_OR_DETOUR";
  }

  const explanations = new Map<string, UnmatchedReason>();
  for (const [id, passenger] of passengers) {
    if (!seated.has(id)) explanations.set(id, explain(passenger));
  }
  return explanations;
}

const timingShifts = [5, -5, 10, -10, 15, -15, 20, -20, 25, -25, 30, -30];

export function suggestCoordination(
  leg: Leg,
  event: EventTiming,
  trips: readonly Trip[],
  activeRoutes: readonly Route[],
  options: MatchOptions & { hubs?: readonly Location[]; lockedDrivers?: ReadonlySet<string> } = {},
): Map<string, CoordinationSuggestion[]> {
  const { distance, passengers, seated, cars } = carpoolState(leg, event, trips, activeRoutes, options);
  const openCars = cars.filter(({ stops, driver }) => stops.length < driver.seats);
  const extraByDriver = new Map(activeRoutes.map((route) => [route.driverId, route.extraKm]));
  const result = new Map<string, CoordinationSuggestion[]>();

  function bestInsertion(rider: Passenger, change: CoordinationChange) {
    let best: CoordinationSuggestion | undefined;
    for (const car of openCars) {
      const locked = options.lockedDrivers?.has(car.driver.id) ?? false;
      if (locked && best && !best.locked) continue;
      for (let index = 0; index <= car.stops.length; index += 1) {
        const route = score(car, car.stops.toSpliced(index, 0, rider), event, distance);
        if (!route) continue;
        const addedKm = Math.max(0, route.extraKm - (extraByDriver.get(car.driver.id) ?? 0));
        if (!best || (best.locked && !locked) || (best.locked === locked && addedKm < best.addedKm)) {
          best = { route, change, stopIndex: index + 1, addedKm, locked };
        }
      }
    }
    return best;
  }

  for (const [id, rider] of passengers) {
    if (seated.has(id) || !openCars.length) continue;
    const direct = bestInsertion(rider, { kind: "DIRECT" });
    if (direct && !direct.locked) {
      result.set(id, [direct]);
      continue;
    }

    const hubs = leg === "TO_EVENT" ? (options.hubs ?? [])
      .map((location, index) => ({ location, index, movedKm: distance(rider.location, location) }))
      .filter((hub) => hub.movedKm > 0.001)
      .sort((a, b) => a.movedKm - b.movedKm) : [];
    let atHub: CoordinationSuggestion | undefined;
    for (const { location, index } of hubs) {
      const alternate = bestInsertion({ ...rider, location }, { kind: "HUB", hubIndex: index });
      if (alternate && (!atHub || (atHub.locked && !alternate.locked))) atHub = alternate;
      if (atHub && !atHub.locked) break;
    }

    let atTime: CoordinationSuggestion | undefined;
    for (const shiftMinutes of timingShifts) {
      const alternate = bestInsertion(shiftPassenger(rider, shiftMinutes), { kind: "TIMING", shiftMinutes });
      if (alternate && (!atTime || (atTime.locked && !alternate.locked))) atTime = alternate;
      if (atTime && !atTime.locked) break;
    }

    const suggestions = [direct, atHub, atTime].filter((suggestion) => suggestion !== undefined)
      .sort((a, b) => Number(a.locked) - Number(b.locked));
    if (suggestions.length) result.set(id, suggestions);
  }
  return result;
}
