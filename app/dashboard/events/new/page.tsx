import { BackLink, PageHeading } from "@/components/shell";
import { EventForm } from "@/components/event-form";

export const metadata = { title: "Create an event" };
export default function NewEvent() {
  return <main className="frame narrow page">
    <BackLink href="/dashboard">My events</BackLink>
    <PageHeading title="Create an event" description="Set your event details and get a link for guests to register their trips." />
    <EventForm />
  </main>;
}
