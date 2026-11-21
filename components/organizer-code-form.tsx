"use client";

import { useActionState, useState } from "react";
import { requestOrganizerCode, verifyOrganizerCode } from "@/app/organizer-auth";
import { Button } from "./ui/button";
import { ActionForm, Feedback } from "./ui/form";

export function OrganizerCodeForm({ destination }: { destination: string }) {
  const [state, request, pending] = useActionState(requestOrganizerCode, {});
  const [editing, setEditing] = useState(false);
  if (state.email && !editing && !pending) {
    return <div className="form-section">
      <p>Enter the sign-in code sent to <strong>{state.email}</strong>.</p>
      <ActionForm className="form-section" action={verifyOrganizerCode.bind(null, destination, state.email)}
        submit="Verify and sign in" pendingLabel="Verifying…">
        <label className="field"><span>Sign-in code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} required />
        </label>
      </ActionForm>
      <Button variant="ghost" size="small" className="self-start" onClick={() => setEditing(true)}>Request another code or change email</Button>
    </div>;
  }
  return <form className="form-section" action={(form) => {
    setEditing(false);
    request(form);
  }}>
    <label className="field"><span>Email address</span>
      <input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.email} required />
    </label>
    <Feedback state={state} />
    <Button type="submit" disabled={pending}>{pending ? "Sending code…" : "Email me a sign-in code"}</Button>
  </form>;
}
