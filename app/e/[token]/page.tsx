import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { forgetMyRide } from "@/app/actions";
import { loadGuestRegistration, loadPublicSignup } from "@/lib/data";
import { rememberedRegistration } from "@/lib/registration-cookie";
import { registrationProof } from "@/lib/tokens";
import { deadlinePassed, formatTime } from "@/lib/time";
import { Header, PageHeading, Empty } from "@/components/shell";
import { RegistrationForm } from "@/components/registration-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Event registration", robots: { index: false, follow: false } };

export default async function Signup({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [event, remembered] = await Promise.all([loadPublicSignup(token), rememberedRegistration()]);
  if (!event) notFound();
  const saved = remembered ? await loadGuestRegistration(remembered) : null;
  const { name, organization_name, description, venue, starts_at, ends_at, timezone, registration_deadline, hubs } = event;
  const publicEvent = { name, organization_name, description, venue, starts_at, ends_at, timezone, registration_deadline, hubs };
  const open = !event.is_demo && event.registration_open && !deadlinePassed(registration_deadline);
  const id = randomUUID();

  return <><Header /><main className="frame narrow page">
    <PageHeading eyebrow={organization_name || "EVENT REGISTRATION"} title={name} description={description || undefined} />
    <div className="event-facts">
      <p><MapPin size={18} />{venue.label}</p>
      <p><CalendarDays size={18} />{formatTime(starts_at, timezone, true)} · {timezone}</p>
    </div>
    {saved?.eventId === event.id ? <section className="card form-section">
      <h2>You’re registered</h2>
      <div className="cluster">
        <Link className={buttonVariants()} href={`/my-ride/${remembered}`} prefetch={false}>My ride</Link>
        <form action={forgetMyRide.bind(null, token)}>
          <button className={buttonVariants({ variant: "ghost", size: "small" })} type="submit">Forget on this browser</button>
        </form>
      </div>
    </section> : open ? <>
      <p className="muted deadline">Register by {formatTime(registration_deadline, timezone, true)}.</p>
      <RegistrationForm event={publicEvent} token={token} id={id} proof={registrationProof(event.id, id)} />
    </> : <Empty title="Registration is closed"><p>Contact the organizer if you still need to arrange a ride.</p></Empty>}
  </main></>;
}
