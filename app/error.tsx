"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="narrow frame page"><section className="card">
    <h1>Something went wrong</h1>
    <p>Try loading this page again in a moment.</p>
    <div className="cluster"><Button onClick={reset}>Try again</Button>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>Back to Carpool</Link></div>
  </section></main>;
}
