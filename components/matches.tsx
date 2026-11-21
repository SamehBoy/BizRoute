import { CalendarClock, CarFront, CircleAlert, MapPin, Navigation, Route, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { RouteView } from "@/lib/domain";
import type { AssignmentStatus, CoordinationSuggestion, Leg, Location, UnmatchedReason } from "@/lib/matching/types";
import { googleMapsLinks } from "@/lib/google-maps";
import { estimateDetourMinutes } from "@/lib/matching/distance";
import { formatTime } from "@/lib/time";
import { buttonVariants } from "./ui/button";

export const STATUS_TEXT = {
  PROPOSED: "Awaiting driver",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  PENDING: "Awaiting organizer",
  UNMATCHED: "Unmatched",
} as const;

export function Status({ status }: { status: keyof typeof STATUS_TEXT }) {
  const color = status === "CONFIRMED" ? " green" : status === "DECLINED" || status === "CANCELLED" || status === "UNMATCHED" ? " amber" : "";
  return <span className={`badge${color}`}>{STATUS_TEXT[status]}</span>;
}

export function MapActions({ origin, destination, stops }: { origin: Location; destination: Location; stops: Location[] }) {
  const urls = googleMapsLinks(origin, stops, destination);
  return <div className="cluster">
    {urls.map((url, index) => <a className={buttonVariants({ variant: "secondary", size: "small" })}
      key={url} target="_blank" rel="noopener noreferrer" href={url}>
      <Navigation size={15} />{urls.length === 1 ? "Open in Google Maps" : `Google Maps · Part ${index + 1}`}
    </a>)}
  </div>;
}

export function RouteStops({ origin, destination, stops, leg }: {
  origin: Location; destination: Location; stops: { name: string; location: Location }[]; leg: Leg;
}) {
  return <ol className="route-stops">
    <li><span className="route-node endpoint"><CarFront size={14} /></span><div><strong>{origin.label}</strong><small>Start</small></div></li>
    {stops.map((stop, index) => <li key={index}>
      <span className="route-node">{index + 1}</span>
      <div><strong>{stop.location.label}</strong><small>{leg === "TO_EVENT" ? "Pick up" : "Drop off"} {stop.name}</small></div>
    </li>)}
    <li><span className="route-node endpoint"><MapPin size={14} /></span><div><strong>{destination.label}</strong><small>Destination</small></div></li>
  </ol>;
}

export function DetourEstimate({ extraKm, stops }: { extraKm: number; stops: number }) {
  return <>Estimated detour · +{extraKm.toFixed(1)} km straight-line · about {Math.round(estimateDetourMinutes(extraKm, stops))} min</>;
}

export function MatchCard({ route, leg, timezone, approved }: { route: RouteView; leg: Leg; timezone: string; approved: boolean }) {
  return <article className="card match-card">
    <div className="spread match-card-head">
      <div className="cluster"><div className="feature-icon"><CarFront size={22} /></div>
        <div><h3>{route.driverName}</h3>
          {route.status === "DECLINED" || route.status === "CANCELLED" ? <p className="muted">Seats unavailable</p>
            : <p className="muted"><SeatUsage assigned={route.stops.length} offered={route.offeredSeats} /></p>}
        </div>
      </div>
      {approved ? <Status status={route.status} /> : <span className="badge">Proposed</span>}
    </div>
    <RouteStops origin={route.origin} destination={route.destination} stops={route.stops} leg={leg} />
    <div className="match-meta">
      <span><Route size={16} /><span><DetourEstimate extraKm={route.extraKm} stops={route.stops.length} /></span></span>
      <span><CalendarClock size={16} /> Suggested start {formatTime(route.departureAt, timezone)}</span>
    </div>
    <MapActions origin={route.origin} destination={route.destination} stops={route.stops.map((stop) => stop.location)} />
  </article>;
}

function SeatUsage({ assigned, offered }: { assigned: number; offered: number }) {
  return <><strong>{assigned}/{offered}</strong> passenger seats assigned</>;
}

export function OpenSeats({ drivers, routes }: {
  drivers: { id: string; name: string; seats: number; contact?: string | null }[];
  routes: Pick<RouteView, "driverId" | "stops">[];
}) {
  if (!drivers.length) return null;
  const assignedByDriver = new Map(routes.map((route) => [route.driverId, route.stops.length]));
  const openCars = drivers.flatMap((driver) => {
    const assigned = assignedByDriver.get(driver.id) ?? 0;
    const open = driver.seats - assigned;
    return open > 0 ? [{ ...driver, assigned, open }] : [];
  }).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const total = openCars.reduce((sum, car) => sum + car.open, 0);

  return <section className="card open-seats">
    <div className="spread">
      <div className="cluster"><div className="feature-icon"><CarFront size={21} /></div><h2>Open seats</h2></div>
      {total > 0 && <span className="badge green">{total} {total === 1 ? "seat" : "seats"} open</span>}
    </div>
    {openCars.length ? <ul>
      {openCars.map((car) => <li key={car.id}>
        <div className="open-seat-driver">
          <strong>{car.name}</strong>
          {car.contact && <span className="muted">{car.contact}</span>}
        </div>
        <div className="open-seat-usage">
          <span><SeatUsage assigned={car.assigned} offered={car.seats} /></span>
          <span className="badge green">{car.open} open</span>
        </div>
      </li>)}
    </ul> : <p className="muted">All offered seats are assigned for this direction.</p>}
  </section>;
}

const coordinationReasons = {
  NO_DRIVERS: "No available drivers for this direction",
  CAPACITY: "Compatible cars are full",
  DETOUR: "Beyond drivers’ estimated detour limits",
  TIMING: "Timing doesn’t fit the available routes",
  TIMING_OR_DETOUR: "Timing and detour limits leave no fit",
  OPEN_SEAT: "A compatible car has an open seat",
  NEW_REQUEST: "Registered after this matching run",
  DECLINED: "Assigned driver declined",
  CANCELLED: "Assigned ride was cancelled",
} satisfies Record<UnmatchedReason | "NEW_REQUEST" | "DECLINED" | "CANCELLED", string>;

const outreach: Partial<Record<keyof typeof coordinationReasons, string>> = {
  NO_DRIVERS: "Ask for a driver for this direction.",
  CAPACITY: "Ask for another seat with a driver who can cover this trip.",
  DETOUR: "Ask whether the rider can meet at a public spot closer to a driver’s route.",
  TIMING: "Ask whether the rider can shift their availability.",
  TIMING_OR_DETOUR: "Check whether a different meetup spot or time would work.",
  DECLINED: "Let the rider know their previous ride fell through.",
  CANCELLED: "Let the rider know their previous ride fell through.",
};

export function CoordinationConsent() {
  return <label className="checkbox"><input name="agreed" type="checkbox" required />
    <span>The rider agreed to this change.</span>
  </label>;
}

export function CoordinationOption({ suggestion, driverName, contact, leg, timezone, children }: {
  suggestion: CoordinationSuggestion; driverName: string; contact?: string | null; leg: Leg; timezone: string; children?: ReactNode;
}) {
  const { change, route, stopIndex, addedKm, locked } = suggestion;
  const location = route.stops[stopIndex - 1].location;
  const window = leg === "TO_EVENT" ? "pickup window" : "departure window";
  return <div className="coordination-option">
    <div className="coordination-person"><strong>{driverName}</strong>{contact && <span>{contact}</span>}</div>
    <p>{change.kind === "HUB" ? <>Ask the rider to meet at <strong>{location.label}</strong>.</>
      : change.kind === "TIMING" ? <>Ask the rider to move their {window} <strong>
        {Math.abs(change.shiftMinutes)} min {change.shiftMinutes < 0 ? "earlier" : "later"}</strong>.</>
        : "An open seat fits the rider’s current details."}</p>
    <p className="field-hint">About {Math.round(estimateDetourMinutes(addedKm, 1))} min more for the driver ·
      Suggested departure {formatTime(route.departureAt, timezone)}</p>
    {locked ? <p className="field-hint">This driver has already confirmed. Discuss the option with them directly.</p> : children}
  </div>;
}

export function Unmatched({ people }: {
  people: { id: string; name: string; contact?: string | null; reason: keyof typeof coordinationReasons; suggestions?: ReactNode[] }[];
}) {
  if (!people.length) return null;
  return <section className="card unmatched">
    <div className="cluster"><div className="feature-icon amber"><CircleAlert size={21} /></div><h2>Needs coordination</h2></div>
    <p className="muted">These passengers still need a ride for this direction.</p>
    <ul>{people.map((person) => <li key={person.id}>
      <UsersRound size={16} />
      <div className="coordination-details">
        <div className="coordination-person"><strong>{person.name}</strong>{person.contact && <span>{person.contact}</span>}</div>
        <span className="coordination-reason">{coordinationReasons[person.reason]}</span>
        {person.suggestions?.length ? <div className="coordination-options">{person.suggestions}</div>
          : outreach[person.reason] && <p className="field-hint">{outreach[person.reason]}</p>}
      </div>
    </li>)}</ul>
  </section>;
}

export function activeCounts(routes: { status: AssignmentStatus; stops: unknown[] }[]) {
  return {
    matched: routes.filter((route) => route.status === "PROPOSED" || route.status === "CONFIRMED")
      .reduce((sum, route) => sum + route.stops.length, 0),
    confirmed: routes.filter((route) => route.status === "CONFIRMED").length,
  };
}
