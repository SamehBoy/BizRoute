import { notFound } from "next/navigation";
import { respondToRide } from "@/app/actions";
import { RideDetails } from "@/components/ride-details";
import { Status } from "@/components/matches";
import { Header, PageHeading } from "@/components/shell";
import { loadRide } from "@/lib/data";
import { LEG_LABEL } from "@/lib/matching/types";

export const metadata = { title: "Private ride details", robots: { index: false, follow: false } };

export default async function PrivateRide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ride = await loadRide(token);
  if (!ride) notFound();
  const respond = ride.assignmentId ? respondToRide.bind(null, token, ride.assignmentId, ride.routeVersion) : undefined;

  return <><Header /><main className="frame narrow page">
    <PageHeading eyebrow="PRIVATE RIDE DETAILS" title={ride.event} description={LEG_LABEL[ride.leg]}
      actions={<Status status={ride.status} />} />
    <RideDetails ride={ride} respond={respond} />
  </main></>;
}
