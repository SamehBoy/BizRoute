import Link from "next/link";
import { CalendarDays, CarFront, Link2, MapPin, Route, Trash2, UsersRound } from "lucide-react";
import { deleteEvent, setRegistration } from "@/app/actions";
import { Empty, BackLink, PageHeading } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { ActionForm, CopyButton } from "@/components/ui/form";
import { loadWorkspace, routesForRun } from "@/lib/data";
import { LEGS, LEG_LABEL } from "@/lib/matching/types";
import { requireOrganizer } from "@/lib/supabase/server";
import { deadlinePassed, formatTime } from "@/lib/time";
import { registrationToken, tripToken } from "@/lib/tokens";
import { activeCounts } from "@/components/matches";

export const metadata = { title: "Event workspace" };

export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await requireOrganizer();
  const workspace = await loadWorkspace(id, owner.id);
  const { event, participants, trips, runs } = workspace;
  const registrationEnded = deadlinePassed(event.registration_deadline);
  const open = event.registration_open && !registrationEnded && !event.is_demo;
  const signup = `/e/${event.public_token}`;
  const base = `/dashboard/events/${id}`;

  return <main className="frame page">
    <BackLink href="/dashboard">My events</BackLink>
    <PageHeading eyebrow={event.is_demo ? "FICTIONAL DEMO EVENT" : event.organization_name || "EVENT WORKSPACE"}
      title={event.name} description={event.description || undefined}
      actions={<Link className={buttonVariants()} href={`${base}/matches`}><Route size={18} /> Review matches</Link>} />
    <div className="event-facts">
      <p><MapPin size={18} />{event.venue.label}</p>
      <p><CalendarDays size={18} />{formatTime(event.starts_at, event.timezone, true)} · {event.timezone}</p>
    </div>
    <div className="event-summary">
      <section className="card metric">
        <div className="feature-icon"><UsersRound size={21} /></div>
        <h2>{participants.length}</h2>
        <p>Registered participants</p>
      </section>
      <section className="card share-card">
        <div className="spread"><div className="cluster"><div className="feature-icon"><Link2 size={20} /></div><h2>Registration</h2></div>
          <span className={`badge${open ? " green" : ""}`}>{event.is_demo ? "Demo only" : open ? "Open" : "Closed"}</span>
        </div>
        {event.is_demo ? <p className="muted">This event contains fictional registrations.</p> : <>
          <p className="muted">Deadline {formatTime(event.registration_deadline, event.timezone, true)}</p>
          <div className="cluster"><CopyButton label="Copy signup link" path={signup} />
            <Link className={buttonVariants({ variant: "ghost", size: "small" })} href={signup} target="_blank">Open signup page</Link>
          </div>
        </>}
      </section>
    </div>
    <section className="section-gap">
      <div className="section-heading"><h2>Trip directions</h2></div>
      <div className="two-col">
        {LEGS.map((leg) => {
          const legTrips = trips.filter((trip) => trip.leg === leg);
          const drivers = legTrips.filter((trip) => trip.role === "DRIVER");
          const passengers = legTrips.length - drivers.length;
          const run = runs.find((item) => item.leg === leg && item.status === "APPROVED") || runs.find((item) => item.leg === leg);
          const routes = run ? routesForRun(workspace, run) : [];
          const counts = activeCounts(routes);
          return <article className="card direction-card" key={leg}>
            <div className="spread"><div className="feature-icon"><CarFront size={22} /></div>
              {run && <span className={`badge${run.status === "APPROVED" ? " green" : ""}`}>
                {run.status === "APPROVED" ? "Approved" : "Proposal ready"}</span>}</div>
            <h3>{LEG_LABEL[leg]}</h3>
            <p className="muted">{drivers.length} drivers · {passengers} passengers</p>
            <p className="muted">{run ? `${counts.matched} matched · ${passengers - counts.matched} unmatched · ${counts.confirmed} confirmed cars`
              : drivers.length ? "Ready to generate a proposal." : "Waiting for driver offers."}</p>
            <Link href={`${base}/matches?leg=${leg}`} className={buttonVariants({ variant: "secondary", size: "small" })}>View direction</Link>
          </article>;
        })}
      </div>
    </section>
    <section className="section-gap">
      <div className="section-heading"><h2>Participants</h2>
        <p className="muted">Guests get private ride access when they register. Copy an individual link here if someone needs help finding it.</p>
      </div>
      {participants.length ? <div className="card roster">
        {participants.map((person) => <article className="roster-row" key={person.id}>
          <div><h3>{person.display_name}</h3>{person.contact_value && <p className="muted">{person.contact_value}</p>}</div>
          <div className="roster-legs">
            {LEGS.map((leg) => {
              const trip = trips.find((item) => item.participant_id === person.id && item.leg === leg);
              if (!trip) return null;
              const path = person.has_my_ride ? null : `/ride/${tripToken(trip.id)}`;
              return <div className="roster-trip" key={leg}>
                <span>{LEG_LABEL[leg]} · {trip.role === "DRIVER" ? "Driver" : "Passenger"}</span>
                {path && <div className="cluster"><CopyButton path={path} label="Copy ride link" />
                  <Link href={path} prefetch={false} target="_blank" rel="noreferrer" className="text-link">Open</Link></div>}
              </div>;
            })}
            {person.has_my_ride && <CopyButton path={`/my-ride/${registrationToken(event.id, person.id)}`} label="Copy My ride link" />}
          </div>
        </article>)}
      </div> : <Empty title="No registrations yet"><p>Share your signup link to collect trip requests and seat offers.</p></Empty>}
    </section>
    <details className="card event-settings section-gap">
      <summary>Event settings</summary>
      {!registrationEnded && !event.is_demo && <ActionForm action={setRegistration.bind(null, id, !open)}
        submit={open ? "Close registration" : "Reopen registration"} variant="secondary" />}
      <ActionForm action={deleteEvent.bind(null, id)} submit={<><Trash2 size={17} /> Delete event</>}
        pendingLabel="Deleting event…" variant="danger" className="form-section">
        <h3>Delete this event</h3><p className="muted">This permanently removes its registrations, matching history, and ride links.</p>
        <label className="checkbox"><input name="confirm" type="checkbox" required /> I confirm permanent deletion.</label>
      </ActionForm>
    </details>
  </main>;
}
