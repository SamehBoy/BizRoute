import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { signInWithGoogle, signInWithPassword } from "@/app/organizer-auth";
import { OrganizerCodeForm } from "@/components/organizer-code-form";
import { Header, PageHeading } from "@/components/shell";
import { ActionForm } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { organizerDestination } from "@/lib/organizer-destination";
import { googleLoginEnabled } from "@/lib/supabase/auth-origin";
import { privateSupabase } from "@/lib/supabase/config";
import { organizer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizer sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; auth_failed?: string }> }) {
  const search = await searchParams;
  const destination = organizerDestination(search.next);
  if (await organizer()) redirect(destination);
  const configured = Boolean(privateSupabase());
  return <><Header /><main className="frame page login-page">
    <div className="feature-icon"><LockKeyhole size={24} /></div>
    <PageHeading title="Organizer sign in" description="Sign in or create an organizer account to manage your events." />
    <section className="card login-card form-section">
      {configured ? <>
        {search.auth_failed && <p role="alert" className="notice error">Google sign-in couldn’t finish. Try again or sign in with an email code.</p>}
        <OrganizerCodeForm destination={destination} />
        {googleLoginEnabled() && <ActionForm action={signInWithGoogle.bind(null, destination)} submit="Continue with Google"
          pendingLabel="Opening Google…" variant="secondary" />}
        <details className="coordinates">
          <summary>Use a password</summary>
          <ActionForm className="form-section" action={signInWithPassword.bind(null, destination)} submit="Sign in with password" pendingLabel="Signing in…">
            <label className="field"><span>Account email</span><input name="email" type="email" autoComplete="username" required /></label>
            <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          </ActionForm>
        </details>
      </> : <><h2>Organizer access needs setup</h2>
        <p className="muted">Connect a Supabase project to create events and collect registrations. You can try ride matching now with fictional data.</p>
        <Link className={buttonVariants()} href="/demo">Explore the demo</Link>
      </>}
    </section>
  </main></>;
}
