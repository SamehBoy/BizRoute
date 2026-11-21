import Link from "next/link";
import { Empty, Header } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return <><Header /><main className="narrow frame page">
    <Empty title="This link is unavailable"><p>Check the link or ask the event organizer for a current one.</p>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>Back to Carpool</Link>
    </Empty>
  </main></>;
}
