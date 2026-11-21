import Link from "next/link";
import { CalendarPlus, FlaskConical, MapPin } from "lucide-react";
import { createDemo } from "@/app/actions";
import { Empty, PageHeading } from "@/components/shell";
import { ActionForm } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { requireOrganizer, service } from "@/lib/supabase/server";
import { formatTime } from "@/lib/time";
import type { Location } from "@/lib/matching/types";

export const metadata = { title: "My events" };
export default async function Dashboard() {
  const user = await requireOrganizer();
  const { data, error } = await service().from("events").select("id,name,venue,starts_at,timezone,is_demo")
    .eq("organizer_id", user.id).order("starts_at", { ascending: false });
  if (error) throw new Error("Could not load your events");
  return <main className="frame page">
    <PageHeading eyebrow="ORGANIZER WORKSPACE" title="My events" description="Manage registration and matches for each event."
      actions={<Link href="/dashboard/events/new" className={buttonVariants()}><CalendarPlus size={18} /> Create event</Link>} />
    {data.length ? <div className="event-grid">
      {data.map((event) => <Link className="card event-tile" href={`/dashboard/events/${event.id}`} key={event.id}>
        <div className="spread"><div className="feature-icon"><MapPin size={22} /></div>
          {event.is_demo && <span className="badge">Fictional demo</span>}</div>
        <h2>{event.name}</h2>
        <p>{(event.venue as Location).label}</p>
        <p className="muted">{formatTime(event.starts_at, event.timezone, true)}</p>
      </Link>)}
    </div> : <Empty title="No events yet"><p>Create an event to open registration, or populate a fictional sample below.</p></Empty>}
    <section className="card demo-callout">
      <div className="feature-icon"><FlaskConical size={22} /></div>
      <div><h2>Try a sample event</h2><p className="muted">Explore proposals, ordered stops, and private ride links with fictional participants.</p></div>
      <ActionForm action={createDemo} submit="Create sample event" variant="secondary" pendingLabel="Creating sample…" />
    </section>
  </main>;
}
