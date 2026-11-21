"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, CarFront, FlaskConical, MapPin, Play, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { demoFixture } from "@/lib/demo";
import { eventTiming, type RouteView } from "@/lib/domain";
import { explainUnmatched, matchTrips, suggestCoordination } from "@/lib/matching";
import { LEGS, LEG_LABEL, type CoordinationSuggestion, type Leg, type MatchResult } from "@/lib/matching/types";
import { formatTime } from "@/lib/time";
import { CoordinationConsent, CoordinationOption, MatchCard, OpenSeats, Unmatched } from "./matches";
import { Empty, PageHeading } from "./shell";
import { Button, buttonVariants } from "./ui/button";

const { event, people } = demoFixture();
const trips = people.flatMap((person) => person.trips);
const names = new Map(people.flatMap((person) => person.trips.map((trip) => [trip.id, person.name])));
type DemoRun = { result: MatchResult; approved: boolean };

export function DemoWorkspace() {
  const [leg, setLeg] = useState<Leg>("TO_EVENT");
  const [runs, setRuns] = useState<Partial<Record<Leg, DemoRun>>>({});
  const run = runs[leg];
  const selected = trips.filter((trip) => trip.leg === leg);
  const offers = selected.flatMap((trip) => trip.role === "DRIVER"
    ? [{ id: trip.id, name: names.get(trip.id)!, seats: trip.seats }] : []);
  const seatsByDriver = new Map(offers.map((offer) => [offer.id, offer.seats]));
  const passengers = selected.length - offers.length;
  const reasons = run ? [...explainUnmatched(leg, eventTiming(event), trips, run.result.routes)] : [];
  const suggestions = run ? suggestCoordination(leg, eventTiming(event), trips, run.result.routes, { hubs: event.hubs }) : undefined;
  const routes: RouteView[] = run?.result.routes.map((route) => ({
    ...route, id: route.driverId, driverName: names.get(route.driverId)!, offeredSeats: seatsByDriver.get(route.driverId)!,
    status: "PROPOSED",
    stops: route.stops.map((stop) => ({ ...stop, name: names.get(stop.passengerId)! })),
  })) ?? [];

  function addDemoRider(passengerId: string, { route }: CoordinationSuggestion) {
    if (!run?.result.unmatchedIds.includes(passengerId)) return;
    const existing = run.result.routes.find((item) => item.driverId === route.driverId);
    const updated = existing ? run.result.routes.map((item) => item === existing ? route : item) : [...run.result.routes, route];
    setRuns({
      ...runs,
      [leg]: {
        ...run,
        result: {
          routes: updated,
          unmatchedIds: run.result.unmatchedIds.filter((id) => id !== passengerId),
          matched: run.result.matched + 1,
          extraKm: updated.reduce((sum, item) => sum + item.extraKm, 0),
        },
      },
    });
  }

  return <main className="frame page demo-page">
    <div className="demo-banner"><FlaskConical size={18} /><span>Interactive demo with fictional participants</span>
      <Link href="/login?next=/dashboard/events/new" className="text-link">Create your own event</Link></div>
    <PageHeading eyebrow="SAMPLE EVENT" title={event.name} description="Try matching rides to and from this event."
      actions={<Button onClick={() => setRuns({
        ...runs, [leg]: { result: matchTrips(leg, eventTiming(event), trips), approved: false },
      })}>{run ? <RotateCcw size={17} /> : <Play size={16} />}{run ? "Regenerate proposal" : "Run matching"}</Button>} />
    <div className="event-facts">
      <p><MapPin size={18} />{event.venue.label}</p>
      <p><CalendarDays size={18} />{formatTime(event.starts_at, event.timezone, true)} · Pacific time</p>
    </div>
    <div className="tabs" aria-label="Trip direction">
      {LEGS.map((direction) => <button type="button" key={direction} onClick={() => setLeg(direction)}
        aria-pressed={direction === leg}>{LEG_LABEL[direction]}</button>)}
    </div>
    <div className="stats-grid">
      <div className="card stat"><CarFront size={19} /><strong>{offers.length}</strong><span>Available drivers</span></div>
      <div className="card stat"><UsersRound size={19} /><strong>{passengers}</strong><span>Passengers</span></div>
      <div className="card stat"><ShieldCheck size={19} /><strong>{run?.result.matched ?? "—"}</strong><span>Matched passengers</span></div>
      <div className="card stat"><UsersRound size={19} /><strong>{run?.result.unmatchedIds.length ?? "—"}</strong><span>Unmatched passengers</span></div>
    </div>
    {run ? <>
      <section className="card review-toolbar" aria-live="polite">
        <div><h2>{run.approved ? "Approved assignments" : "Proposed assignments"}</h2>
          <p className="muted">{run.approved ? "The sample carpool plan is approved for this direction."
            : "Review the suggested stops and approve the sample proposal."}</p></div>
        {run.approved ? <Link className={buttonVariants({ variant: "secondary" })} href="/login">Organizer sign in</Link>
          : <Button onClick={() => setRuns({ ...runs, [leg]: { ...run, approved: true } })}>Approve this run</Button>}
      </section>
      <p className="field-hint match-hint">Detours are estimated from straight-line distances and stop times. Open Google Maps to see the road route.</p>
      <div className="match-grid">
        {routes.map((route) => <MatchCard key={route.id} route={route} leg={leg} timezone={event.timezone} approved={run.approved} />)}
      </div>
      <Unmatched people={reasons.map(([id, reason]) => ({
        id, name: names.get(id)!, reason,
        suggestions: suggestions?.get(id)?.map((suggestion) =>
          <CoordinationOption key={`${suggestion.route.driverId}-${suggestion.change.kind}`} suggestion={suggestion}
            driverName={names.get(suggestion.route.driverId)!} leg={leg} timezone={event.timezone}>
            <form onSubmit={(event) => {
              event.preventDefault();
              addDemoRider(id, suggestion);
            }}>
              {suggestion.change.kind !== "DIRECT" && <CoordinationConsent />}
              <Button type="submit" variant="secondary">Add to carpool</Button>
            </form>
          </CoordinationOption>),
      }))} />
    </> : <Empty title="Ready to match"><p>Run matching to see who can ride together and where each driver will stop.</p>
      <Button variant="secondary" onClick={() => setRuns({
        ...runs, [leg]: { result: matchTrips(leg, eventTiming(event), trips), approved: false },
      })}><Play size={15} /> Generate a proposal</Button>
    </Empty>}
    <OpenSeats drivers={offers} routes={routes} />
    <details className="card event-settings section-gap" open>
      <summary>Sample registrations</summary>
      <ul className="history-list demo-roster">{selected.map((trip) => <li key={trip.id}>
        <strong>{names.get(trip.id)}</strong><span>{trip.location.label}</span>
        <span className="badge">{trip.role === "DRIVER" ? `Driver · ${trip.seats} seats` : "Passenger"}</span>
      </li>)}</ul>
    </details>
  </main>;
}
