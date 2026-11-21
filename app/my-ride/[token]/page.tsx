import { notFound } from "next/navigation";
import { respondToMyRide } from "@/app/actions";
import { Status } from "@/components/matches";
import { RideDetails } from "@/components/ride-details";
import { BackLink, Header, PageHeading } from "@/components/shell";
import { CopyButton } from "@/components/ui/form";
import { loadGuestRegistration } from "@/lib/data";
import { LEG_LABEL } from "@/lib/matching/types";

export const metadata = { title: "My ride", robots: { index: false, follow: false } };

export default async function MyRide({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ registered?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const registration = await loadGuestRegistration(token);
  if (!registration) notFound();
  const eventLink = `/e/${registration.eventToken}`;
  const justRegistered = search.registered === "1";

  return <><Header /><main className="frame narrow page">
    <BackLink href={eventLink}>Event page</BackLink>
    <PageHeading eyebrow="PRIVATE RIDE DETAILS" title="My ride" description={`${registration.eventName} · ${registration.guestName}`}
      actions={<CopyButton path={`/my-ride/${token}`} label="Copy private link" />} />
    <div className="notice success my-ride-note">
      {justRegistered ? <p><strong>You’re registered.</strong> Check back here after the organizer approves the matches.</p>
        : <p>Check this page for ride updates.</p>}
      <p>Save this private link if you want to check from another device.</p>
    </div>
    {registration.trips.map(({ tripId, ride }) => <section key={tripId} className="section-gap">
      <div className="spread section-heading">
        <div><h2>{LEG_LABEL[ride.leg]}</h2><p className="muted">{ride.role === "DRIVER" ? "Driver" : "Passenger"}</p></div>
        <Status status={ride.status} />
      </div>
      <RideDetails ride={ride} respond={ride.assignmentId
        ? respondToMyRide.bind(null, token, tripId, ride.assignmentId, ride.routeVersion) : undefined} />
    </section>)}
  </main></>;
}
