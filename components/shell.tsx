import Link from "next/link";
import { CarFront, ChevronLeft, Route } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "./ui/button";
import { signOut } from "@/app/actions";

export function Brand() {
  return <Link href="/" className="brand" aria-label="BizRoute home">
    <span className="brand-mark"><CarFront size={21} strokeWidth={2.3} /></span>
    <span>Biz<span className="brand-accent">Route</span></span>
  </Link>;
}

export function Header({ mode = "public" }: { mode?: "public" | "landing" | "organizer" }) {
  return <header className="topbar">
    <div className="frame topbar-inner">
      <Brand />
      {mode === "landing" && <nav aria-label="Main navigation">
        <Link className="nav-how" href="#how-it-works">How it works</Link>
        <Link className="nav-demo" href="/demo">Try the demo</Link>
        <Link className={buttonVariants({ variant: "secondary", size: "small" })} href="/login">Organizer sign in</Link>
      </nav>}
      {mode === "organizer" && <nav aria-label="Organizer navigation">
        <Link href="/dashboard">My events</Link>
        <form action={signOut}><button type="submit" className={buttonVariants({ variant: "secondary", size: "small" })}>Sign out</button></form>
      </nav>}
    </div>
  </header>;
}

export function Footer() {
  return <footer className="site-footer">
    <div className="frame footer-inner">
      <Brand />
      <span>Event carpool coordination</span>
    </div>
  </footer>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="back-link" href={href}><ChevronLeft size={16} />{children}</Link>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><div className="feature-icon"><Route size={22} /></div><h3>{title}</h3><div>{children}</div></div>;
}

export function PageHeading({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return <div className="page-heading">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>;
}
