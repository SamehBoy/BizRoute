import Link from "next/link";
import { CalendarPlus, Link2, Route, UsersRound } from "lucide-react";
import { Header, Footer } from "@/components/shell";
import { HeroMap } from "@/components/hero-map";
import { Button } from "@/components/ui/button";

const steps = [
  { Icon: CalendarPlus, title: "Create your event", copy: "Add your venue and schedule, then share one registration link with your guests." },
  { Icon: UsersRound, title: "Collect ride preferences", copy: "Guests can offer seats or ask for a ride. They choose separately for the trip there and the trip back." },
  { Icon: Route, title: "Match and share rides", copy: "Review suggested carpools, approve the plan, and share private ride links with directions." },
];

export default function Home() {
  return <>
    <Header mode="landing" />
    <main>
      <section className="landing-hero">
        <div className="frame hero-grid">
          <div className="hero-copy">
            <p className="eyebrow hero-eyebrow"><span /> EVENT CARPOOL COORDINATION</p>
            <h1>Good events.<br /><em>Better rides.</em></h1>
            <p className="hero-description">Match drivers and passengers for the trip there and the trip home. All from one event link.</p>
            <div className="hero-actions">
              <Button asChild><Link href="/login?next=/dashboard/events/new"><CalendarPlus size={19} /> Create an event</Link></Button>
              <Button asChild variant="secondary"><Link href="/demo">Explore the demo</Link></Button>
            </div>
            <p className="hero-note"><Link2 size={16} /> No account needed for guests.</p>
          </div>
          <HeroMap />
        </div>
      </section>
      <section id="how-it-works" className="frame landing-steps">
        <div className="section-intro">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>From invite to pickup.</h2>
        </div>
        <div className="steps-grid">
          {steps.map(({ Icon, title, copy }) => <article className="step-card" key={title}>
            <div className="feature-icon"><Icon size={23} /></div>
            <h3>{title}</h3><p>{copy}</p>
          </article>)}
        </div>
      </section>
    </main>
    <Footer />
  </>;
}
