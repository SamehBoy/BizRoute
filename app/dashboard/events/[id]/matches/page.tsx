import Link from "next/link";
import { CarFront, Play, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { addCoordinatedRider, approveRun, runMatching } from "@/app/actions";
import { activeCounts, CoordinationConsent, CoordinationOption, MatchCard, OpenSeats, Unmatched } from "@/components/matches";
import { BackLink, Empty, PageHeading } from "@/components/shell";
import { ActionForm } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { coordinationContext, coordinationSuggestions, loadWorkspace, routesForRun, tripRoster } from "@/lib/data";
import { eventTiming } from "@/lib/domain";
import { explainUnmatched } from "@/lib/matching";
import { LEGS, LEG_LABEL } from "@/lib/matching/types";
import { requireOrganizer } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";

export const metadata = { title: "Review matches" };
export default async function Matches({ params, searchParams }:
  { params: Promise<{ id: string }>; searchParams: Promise<{ leg?: string; view?: string }> }) {
  const { id } = await params;
  const search = await searchParams;
  const leg = search.leg === "FROM_EVENT" ? "FROM_EVENT" : "TO_EVENT";
  const owner = await requireOrganizer();
  const workspace = await loadWorkspace(id, owner.id);
  const { event, trips, runs } = workspace;
  const roster = tripRoster(workspace);
  const base = `/dashboard/events/${id}`;
  const matchUrl = `${base}/matches?leg=${leg}`;
  const candidate = runs.find((run) => run.status === "PROPOSED" && run.leg === leg);
  const live = runs.find((run) => run.status === "APPROVED" && run.leg === leg);
  const run = (search.view === "approved" ? live : candidate) ?? live ?? candidate;
  const stale = run?.status === "PROPOSED" && run.revision !== event.revision;
  const routes = run ? routesForRun(workspace, run) : [];
  const context = coordinationContext(workspace, leg, routes);
  const { excludedDrivers, activeRoutes } = context;
  const driverOffers = [...roster.values()].flatMap((trip) => trip.leg === leg && trip.role === "DRIVER" &&
    trip.seats && !excludedDrivers.has(trip.id) ? [{ id: trip.id, name: trip.name, seats: trip.seats, contact: trip.contact }] : []);
  const eligibleDrivers = driverOffers.length;
  const passengers = trips.filter((trip) => trip.leg === leg && trip.role === "PASSENGER");
  const reasons = run ? [...explainUnmatched(leg, eventTiming(event), context.trips, activeRoutes, { excludedDrivers })] : [];
  const suggestions = run ? coordinationSuggestions(workspace, leg, context) : undefined;
  const versions = new Map(routes.map((route) => [route.driverId, route.routeVersion ?? 0]));
  const previousUnmatched = new Set(run?.unmatched_ids);
  const lostRides = new Map(routes.flatMap(({ status, stops }) =>
    status === "DECLINED" || status === "CANCELLED"
      ? stops.map(({ passengerId }) => [passengerId, status] as const) : []));
  const unmatched = reasons.map(([id, reason]) => ({
    ...roster.get(id)!,
    reason: lostRides.get(id) ?? (previousUnmatched.has(id) ? reason : "NEW_REQUEST" as const),
    suggestions: suggestions?.get(id)?.map((suggestion) => {
      const driver = roster.get(suggestion.route.driverId)!;
      const key = `${driver.id}-${suggestion.change.kind}`;
      return <CoordinationOption key={key} suggestion={suggestion} driverName={driver.name} contact={driver.contact}
        leg={leg} timezone={event.timezone}>
        {run && !suggestion.locked && (stale ? <p className="field-hint">Regenerate this draft to apply the option.</p>
          : <ActionForm action={addCoordinatedRider.bind(null, event.id, run.id, id, driver.id, versions.get(driver.id) ?? null, suggestion.change)}
            submit="Add to carpool" pendingLabel="Adding rider…" variant="secondary">
            {suggestion.change.kind !== "DIRECT" && <CoordinationConsent />}
          </ActionForm>)}
      </CoordinationOption>;
    }),
  }));
  const counts = activeCounts(routes);
  const replacesApproved = run?.status === "PROPOSED" && !!live;

  return <main className="frame page">
    <BackLink href={base}>{event.name}</BackLink>
    <PageHeading eyebrow="MATCH REVIEW" title="Carpool matches" description="Review and approve each direction independently."
      actions={<ActionForm action={runMatching.bind(null, id, leg)} submit={run ? <><RotateCcw size={17} /> Regenerate proposal</>
        : <><Play size={16} /> Run matching</>} pendingLabel="Matching trips…" />} />
    <nav aria-label="Trip direction" className="tabs">
      {LEGS.map((direction) => <Link href={`${base}/matches?leg=${direction}`} key={direction}
        aria-current={direction === leg ? "page" : undefined}>{LEG_LABEL[direction]}</Link>)}
    </nav>
    <div className="stats-grid">
      <div className="card stat"><CarFront size={19} /><strong>{eligibleDrivers}</strong><span>Available drivers</span></div>
      <div className="card stat"><UsersRound size={19} /><strong>{passengers.length}</strong><span>Passengers</span></div>
      <div className="card stat"><ShieldCheck size={19} /><strong>{counts.matched}</strong><span>Matched passengers</span></div>
      <div className="card stat"><UsersRound size={19} /><strong>{run ? unmatched.length : passengers.length}</strong><span>Unmatched passengers</span></div>
    </div>
    {candidate && live && <nav aria-label="Matching run" className="tabs secondary-tabs">
      <Link href={matchUrl} aria-current={run?.id === candidate.id ? "page" : undefined}>New proposal</Link>
      <Link href={`${matchUrl}&view=approved`} aria-current={run?.id === live.id ? "page" : undefined}>Current approved run</Link>
    </nav>}
    {run ? <>
      <section className="card review-toolbar">
        <div><div className="cluster"><h2>{run.status === "APPROVED" ? "Approved assignments" : "Proposed assignments"}</h2>
          {stale && <span className="badge amber">Out of date</span>}</div>
          <p className="muted">{stale ? "Trip availability changed. Regenerate to approve updated assignments."
            : run.status === "APPROVED" ? `${counts.confirmed} confirmed cars. Guests can check their private ride details.`
              : replacesApproved ? "Approval replaces the current run for this direction. Drivers will need to respond again."
                : "Approve this run to make ride details available through private links."}</p>
        </div>
        {run.status === "PROPOSED" ? <ActionForm action={approveRun.bind(null, id, run.id)} submit="Approve this run"
          disabled={stale} pendingLabel="Approving run…" /> : <Link href={base} className={buttonVariants({ variant: "secondary" })}>View participants</Link>}
      </section>
      {routes.length > 0 ? <>
        <p className="field-hint match-hint">Detours are estimated from straight-line distances and stop times. Drivers can check the road route in Google Maps.</p>
        <div className="match-grid">
          {routes.map((route) => <MatchCard key={route.id} route={route} leg={leg} timezone={event.timezone} approved={run.status === "APPROVED"} />)}
        </div>
      </> : <Empty title="No routes in this run"><p>{eligibleDrivers ? "No compatible riders could be assigned." : "This direction has no available drivers."}</p></Empty>}
      <Unmatched people={unmatched} />
    </> : <Empty title={eligibleDrivers ? "Ready to match" : "No available drivers"}>
      <p>{eligibleDrivers ? "Run matching to see suggested carpools and the order of their stops."
        : "Driver offers will appear here as people register. Any passengers remain unmatched until a driver is available."}</p>
    </Empty>}
    <OpenSeats drivers={driverOffers} routes={activeRoutes} />
    {workspace.history.some((entry) => entry.leg === leg) && <details className="card event-settings section-gap">
      <summary>Recent matching runs</summary>
      <ul className="history-list">{workspace.history.filter((entry) => entry.leg === leg).map((entry) =>
        <li key={entry.id}><time dateTime={entry.created_at}>{formatTime(entry.created_at, event.timezone, true)}</time>
          <span className="badge">{entry.status === "APPROVED" ? "Approved" : entry.status === "PROPOSED" ? "Proposed" : "Superseded"}</span></li>)}</ul>
    </details>}
  </main>;
}
