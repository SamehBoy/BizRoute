"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { organizerDestination } from "@/lib/organizer-destination";
import { authOrigin, googleLoginEnabled } from "@/lib/supabase/auth-origin";
import { privateSupabase } from "@/lib/supabase/config";
import { serverAuth } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validation";

export type OrganizerCodeState = ActionState & { email?: string };
const organizerEmail = z.string().trim().max(254).pipe(z.email());
const codeSchema = z.string().trim().regex(/^\d{6,10}$/);
const unavailable = { error: "Organizer sign-in needs a configured Supabase project." };

export async function requestOrganizerCode(_: OrganizerCodeState, form: FormData): Promise<OrganizerCodeState> {
  if (!privateSupabase()) return unavailable;
  const email = organizerEmail.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const auth = await serverAuth();
  const { error } = await auth.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: true } });
  if (error) {
    if (error.status === 429) return { error: "Please wait a minute before requesting another code." };
    return { error: "We couldn’t send a sign-in code. Check the address and try again." };
  }
  return { email: email.data };
}

export async function verifyOrganizerCode(destination: string, emailValue: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!privateSupabase()) return unavailable;
  const email = organizerEmail.safeParse(emailValue);
  const code = codeSchema.safeParse(form.get("code"));
  if (!email.success || !code.success) return { error: "Enter the code from your sign-in email." };
  const auth = await serverAuth();
  const { error } = await auth.auth.verifyOtp({ type: "email", email: email.data, token: code.data });
  if (error) return { error: "This code is incorrect or has expired. Try again or request a new code." };
  redirect(organizerDestination(destination));
}

export async function signInWithGoogle(destination: string, _: ActionState): Promise<ActionState> {
  if (!privateSupabase() || !googleLoginEnabled()) return { error: "Google sign-in is currently unavailable." };
  const callback = new URL("/auth/callback", authOrigin());
  callback.searchParams.set("next", organizerDestination(destination));
  const auth = await serverAuth();
  const { data, error } = await auth.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.href },
  });
  if (error || !data.url) return { error: "Could not start Google sign-in. Please try again." };
  redirect(data.url);
}

export async function signInWithPassword(destination: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!privateSupabase()) return unavailable;
  const input = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { error: "Enter your organizer email address and password." };
  const auth = await serverAuth();
  const { error } = await auth.auth.signInWithPassword(input.data);
  if (error) return { error: "Could not sign in. Check your password or request a sign-in code." };
  redirect(organizerDestination(destination));
}
