"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, CarFront, FlaskConical, MapPin, Maximize, Minimize, Play, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import type { RideResult } from "@/lib/data";
import { demoFixture } from "@/lib/demo";
import { eventTiming, type RouteView } from "@/lib/domain";
import { explainUnmatched, matchTrips, suggestCoordination } from "@/lib/matching";
import { LEGS, LEG_LABEL, type CoordinationSuggestion, type Leg, type MatchResult } from "@/lib/matching/types";
import { formatTime } from "@/lib/time";
import { CoordinationConsent, CoordinationOption, MatchCard, OpenSeats, Status, Unmatched } from "./matches";
import { RideDetails } from "./ride-details";
import { Empty, PageHeading } from "./shell";
import { Button } from "./ui/button";

const { event, people } = demoFixture();
const timing = eventTiming(event);
const trips = people.flatMap((person) => person.trips);
const peopleByTrip = new Map(people.flatMap((person) => person.trips.map((trip) => [trip.id, person])));
const sampleDriver = people[0];

const stages = [
  { id: "event", label: "Event setup" },
  { id: "signup", label: "Guest signup" },
  { id: "matching", label: "Match & approve" },
  { id: "ride", label: "My ride" },
] as const;
type Stage = (typeof stages)[number]["id"];
type DemoDirection = { draft?: MatchResult; live?: { result: MatchResult; confirmedDrivers: string[] } };
type DisplayMode = "normal" | "fullscreen" | "expanded";

export function DemoWorkspace() {
  const [stage, setStage] = useState<Stage>("event");
  const [eventCreated, setEventCreated] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [guestView, setGuestView] = useState<"driver" | "passenger">("driver");
  const [leg, setLeg] = useState<Leg>("TO_EVENT");
  const [runs, setRuns] = useState<Partial<Record<Leg, DemoDirection>>>({});
  const [displayMode, setDisplayMode] = useState<DisplayMode>("normal");
  const demoPage = useRef<HTMLElement>(null);
  const stagePanel = useRef<HTMLElement>(null);

  useEffect(() => {
    function syncFullscreen() {
      const isFullscreen = demoPage.current !== null && document.fullscreenElement === demoPage.current;
      setDisplayMode((mode) => isFullscreen ? "fullscreen" : mode === "fullscreen" ? "normal" : mode);
    }

    function exitOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDisplayMode((mode) => mode === "expanded" ? "normal" : mode);
    }

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", exitOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", exitOnEscape);
    };
  }, []);

  async function toggleFullscreen() {
    const page = demoPage.current;
    if (!page) return;
    if (document.fullscreenElement === page) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (displayMode === "expanded") {
      setDisplayMode("normal");
      return;
    }
    if (document.fullscreenEnabled && page.requestFullscreen) {
      try {
        await page.requestFullscreen();
        return;
      } catch {
        // Embedded viewers can reject fullscreen even when the API is available.
      }
    }
    setDisplayMode("expanded");
  }

  function openStage(next: Stage) {
    setStage(next);
    requestAnimationFrame(() => {
      stagePanel.current?.focus({ preventScroll: true });
      stagePanel.current?.scrollIntoView({ block: "start" });
    });
  }

  function restart() {
    setEventCreated(false);
    setRegistered(false);
    setGuestView("driver");
    setLeg("TO_EVENT");
    setRuns({});
    openStage("event");
  }

  const { draft, live } = runs[leg] ?? {};
  const result = draft ?? live?.result;
  const confirmedDrivers = draft ? [] : live?.confirmedDrivers ?? [];
  const approved = Boolean(live && !draft);
  const selected = trips.filter((trip) => trip.leg === leg);
  const driverTrip = sampleDriver.trips.find((trip) => trip.leg === leg)!;
  const offers = selected.flatMap((trip) => trip.role === "DRIVER"
    ? [{ id: trip.id, name: peopleByTrip.get(trip.id)!.name, seats: trip.seats }] : []);
  const seatsByDriver = new Map(offers.map((offer) => [offer.id, offer.seats]));
  const passengers = selected.length - offers.length;
  const routes: RouteView[] = result?.routes.map((route) => ({
    ...route, id: route.driverId, driverName: peopleByTrip.get(route.driverId)!.name, offeredSeats: seatsByDriver.get(route.driverId)!,
    status: confirmedDrivers.includes(route.driverId) ? "CONFIRMED" : "PROPOSED",
    stops: route.stops.map((stop) => ({ ...stop, name: peopleByTrip.get(stop.passengerId)!.name })),
  })) ?? [];
  const reasons = result && stage === "matching" ? [...explainUnmatched(leg, timing, trips, result.routes)] : [];
  const suggestions = reasons.length && result ? suggestCoordination(leg, timing, trips, result.routes, {
    hubs: event.hubs, lockedDrivers: new Set(confirmedDrivers),
  }) : undefined;

  const driverRoute = live?.result.routes.find((route) => route.driverId === driverTrip.id);
  const driverConfirmed = live?.confirmedDrivers.includes(driverTrip.id);
  const sampleStop = driverRoute?.stops[0];
  const samplePassenger = sampleStop ? peopleByTrip.get(sampleStop.passengerId) : undefined;
  const showingPassenger = guestView === "passenger" && Boolean(sampleStop && samplePassenger);
  const ride: RideResult = {
    event: event.name,
    timezone: event.timezone,
    venue: event.venue,
    leg,
    role: showingPassenger ? "PASSENGER" : "DRIVER",
    location: showingPassenger && sampleStop ? sampleStop.location : driverTrip.location,
    status: driverRoute ? (driverConfirmed ? "CONFIRMED" : "PROPOSED") : live ? "UNMATCHED" : "PENDING",
    driver: driverRoute ? { name: sampleDriver.name, contact: sampleDriver.contact } : undefined,
    riders: driverRoute?.stops.map((stop) => ({
      name: peopleByTrip.get(stop.passengerId)!.name, contact: peopleByTrip.get(stop.passengerId)!.contact, location: stop.location,
    })),
    departureAt: driverRoute ? new Date(driverRoute.departureAt).toISOString() : undefined,
    extraKm: driverRoute?.extraKm,
  };

  function generateProposal() {
    setRuns({ ...runs, [leg]: { live, draft: matchTrips(leg, timing, trips) } });
  }

  function addDemoRider(passengerId: string, { route }: CoordinationSuggestion) {
    if (!result?.unmatchedIds.includes(passengerId) || confirmedDrivers.includes(route.driverId)) return;
    const previousRoutes = result.routes;
    const updated = previousRoutes.some((item) => item.driverId === route.driverId)
      ? previousRoutes.map((item) => item.driverId === route.driverId ? route : item)
      : [...previousRoutes, route];
    const updatedResult = {
      routes: updated,
      unmatchedIds: result.unmatchedIds.filter((id) => id !== passengerId),
      matched: result.matched + 1,
      extraKm: updated.reduce((sum, item) => sum + item.extraKm, 0),
    };
    setRuns({ ...runs, [leg]: draft ? { draft: updatedResult, live } : { live: { result: updatedResult, confirmedDrivers } } });
  }

  function confirmSampleRide() {
    if (!live || !driverRoute || driverConfirmed) return;
    setRuns({ ...runs, [leg]: { draft, live: { ...live, confirmedDrivers: [...live.confirmedDrivers, driverRoute.driverId] } } });
  }

  return <main ref={demoPage} className={`frame page demo-page${displayMode === "expanded" ? " demo-expanded" : ""}`}>
    <div className="demo-banner">
      <span className="demo-banner-label"><FlaskConical size={18} aria-hidden="true" /> Pitch demo with a fictional event and guests</span>
      <div className="demo-banner-actions">
        {displayMode === "normal" && <Link href="/login?next=/dashboard/events/new" className="text-link">Create your own event</Link>}
        <Button size="small" variant="secondary" onClick={toggleFullscreen}>
          {displayMode === "normal" ? <Maximize size={16} aria-hidden="true" /> : <Minimize size={16} aria-hidden="true" />}
          {displayMode === "fullscreen" ? "Exit full screen" : displayMode === "expanded" ? "Exit expanded view" : "Full screen"}
        </Button>
      </div>
    </div>
    <PageHeading title={event.name} description="Walk through an event as the organizer, driver, and passenger." />
    <div className="event-facts">
      <p><MapPin size={18} aria-hidden="true" />{event.venue.label}</p>
      <p><CalendarDays size={18} aria-hidden="true" />{formatTime(event.starts_at, event.timezone, true)} · Pacific time</p>
    </div>
    <div className="spread demo-navigation">
      <nav className="tabs" aria-label="Demo walkthrough">
        {stages.map(({ id, label }) => <button key={id} type="button"
          disabled={id === "signup" ? !eventCreated : (id === "matching" || id === "ride") && !registered}
          aria-current={stage === id ? "step" : undefined} onClick={() => openStage(id)}>{label}</button>)}
      </nav>
      {eventCreated && <Button type="button" size="small" variant="ghost" onClick={restart}>
        <RotateCcw size={15} aria-hidden="true" />Restart demo
      </Button>}
    </div>
    <section className="demo-stage" ref={stagePanel} tabIndex={-1} aria-label={stages.find(({ id }) => id === stage)?.label}>
      {stage === "event" && <div className="card form-section demo-preview">
        <h2>Set up your event</h2>
        <p className="muted">Start with a name, a destination, and a schedule. The signup page is ready to share as soon as you create the event.</p>
        <dl className="demo-facts">
          <div><dt>Event name</dt><dd>{event.name}</dd></div>
          <div><dt>Destination</dt><dd>{event.venue.label}</dd></div>
          <div><dt>Starts</dt><dd>{formatTime(event.starts_at, event.timezone, true)}</dd></div>
          <div><dt>Ends</dt><dd>{formatTime(event.ends_at, event.timezone)}</dd></div>
        </dl>
        <Button type="button" onClick={() => {
          setEventCreated(true);
          openStage("signup");
        }}>{eventCreated ? "Open sample signup" : "Create sample event"}</Button>
      </div>}

      {stage === "signup" && <div className="card form-section demo-preview">
        <h2>Guest signup</h2>
        <p className="muted">This is the page guests open from the event link. Maya is offering seats in both directions.</p>
        <dl className="demo-facts">
          <div><dt>Name</dt><dd>{sampleDriver.name}</dd></div>
          <div><dt>Contact</dt><dd>{sampleDriver.contact}</dd></div>
          {sampleDriver.trips.map((trip) => <div key={trip.id}><dt>{LEG_LABEL[trip.leg]}</dt>
            <dd>{trip.role === "DRIVER" ? `Drive · ${trip.seats} seats` : "Request a ride"} · {trip.location.label}</dd>
          </div>)}
        </dl>
        <Button type="button" onClick={() => {
          setRegistered(true);
          setGuestView("driver");
          openStage("ride");
        }}>{registered ? "Open Maya’s My ride" : "Register as Maya Chen"}</Button>
      </div>}

      {(stage === "matching" || stage === "ride") && <div className="tabs" aria-label="Trip direction">
        {LEGS.map((direction) => <button type="button" key={direction} onClick={() => setLeg(direction)}
          aria-pressed={direction === leg}>{LEG_LABEL[direction]}</button>)}
      </div>}

      {stage === "matching" && <>
        <div className="stats-grid">
          <div className="card stat"><CarFront size={19} /><strong>{offers.length}</strong><span>Available drivers</span></div>
          <div className="card stat"><UsersRound size={19} /><strong>{passengers}</strong><span>Passengers</span></div>
          <div className="card stat"><ShieldCheck size={19} /><strong>{result?.matched ?? "—"}</strong><span>Matched passengers</span></div>
          <div className="card stat"><UsersRound size={19} /><strong>{result?.unmatchedIds.length ?? "—"}</strong><span>Unmatched passengers</span></div>
        </div>
        {result ? <>
          <section className="card review-toolbar" aria-live="polite">
            <div><h2>{approved ? "Approved assignments" : "Proposed assignments"}</h2>
              <p className="muted">{approved ? `${confirmedDrivers.length} ${confirmedDrivers.length === 1 ? "driver" : "drivers"} confirmed. Guests can check My ride for this direction.`
                : "Review the suggested stops before making the rides visible to guests."}</p></div>
            <div className="cluster">
              <Button type="button" variant="secondary" onClick={generateProposal}>
                <RotateCcw size={15} aria-hidden="true" />Regenerate proposal
              </Button>
              {draft ? <Button type="button" onClick={() => setRuns({ ...runs, [leg]: { live: { result: draft, confirmedDrivers: [] } } })}>Approve this run</Button>
              : <Button type="button" onClick={() => {
                setGuestView("driver");
                openStage("ride");
              }}>Open Maya’s My ride</Button>}
            </div>
          </section>
          <p className="field-hint match-hint">Detours are estimates. Sample directions use Vancouver landmarks, with the Convention Centre as the destination.</p>
          <div className="match-grid">
            {routes.map((route) => <MatchCard key={route.id} route={route} leg={leg} timezone={event.timezone} approved={approved} />)}
          </div>
          <Unmatched people={reasons.map(([id, reason]) => ({
            id, name: peopleByTrip.get(id)!.name, reason,
            suggestions: suggestions?.get(id)?.map((suggestion) =>
              <CoordinationOption key={`${suggestion.route.driverId}-${suggestion.change.kind}`} suggestion={suggestion}
                driverName={peopleByTrip.get(suggestion.route.driverId)!.name} leg={leg} timezone={event.timezone}>
                <form onSubmit={(submitEvent) => {
                  submitEvent.preventDefault();
                  addDemoRider(id, suggestion);
                }}>
                  {suggestion.change.kind !== "DIRECT" && <CoordinationConsent />}
                  <Button type="submit" variant="secondary">Add to carpool</Button>
                </form>
              </CoordinationOption>),
          }))} />
        </> : <Empty title="Ready to match"><p>Maya and seven other fictional guests have registered. Run matching to see who can ride together.</p>
          <Button type="button" onClick={generateProposal}><Play size={15} aria-hidden="true" />Run matching</Button>
        </Empty>}
        <OpenSeats drivers={offers} routes={routes} />
        <details className="card event-settings section-gap" open>
          <summary>Sample registrations</summary>
          <ul className="history-list demo-roster">{selected.map((trip) => <li key={trip.id}>
            <strong>{peopleByTrip.get(trip.id)!.name}</strong><span>{trip.location.label}</span>
            <span className="badge">{trip.role === "DRIVER" ? `Driver · ${trip.seats} seats` : "Passenger"}</span>
          </li>)}</ul>
        </details>
      </>}

      {stage === "ride" && <>
        <div className="spread demo-ride-header">
          <div><h2>My ride · {showingPassenger ? samplePassenger?.name : sampleDriver.name}</h2>
            <p className="muted">{showingPassenger ? "Passenger view" : "Driver view"}</p>
          </div>
          <Status status={ride.status} />
        </div>
        {!live && <div className="notice success my-ride-note">
          <p><strong>You’re registered.</strong> This is the private page guests can save. It shows the route once the organizer approves the matches.</p>
        </div>}
        {samplePassenger && <div className="tabs" aria-label="Guest perspective">
          <button type="button" aria-pressed={!showingPassenger} onClick={() => setGuestView("driver")}>{sampleDriver.name} · Driver</button>
          <button type="button" aria-pressed={showingPassenger} onClick={() => setGuestView("passenger")}>{samplePassenger.name} · Passenger</button>
        </div>}
        <RideDetails ride={ride} driverActions={driverConfirmed
          ? <p role="status">Passengers can now see that the driver confirmed.</p>
          : <Button type="button" onClick={confirmSampleRide}>Confirm ride</Button>} />
        <Button type="button" className="demo-return" variant={live ? "secondary" : "primary"}
          onClick={() => openStage("matching")}>{live ? "Back to organizer view" : "Go to organizer matching"}</Button>
      </>}
    </section>
  </main>;
}
