"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { CarFront, Check, LoaderCircle, UserRound, X } from "lucide-react";
import { register } from "@/app/actions";
import type { PublicEvent } from "@/lib/domain";
import { LEG_LABEL, type DetourLimit, type Leg } from "@/lib/matching/types";
import { formatTime, localInput, readLocal } from "@/lib/time";
import { emptyLocation, hasPoint, LocationPicker, type LocationDraft } from "./location-picker";
import { Button } from "./ui/button";
import { Feedback } from "./ui/form";

type Choice = "NONE" | "DRIVER" | "PASSENGER";
type DetourUnit = DetourLimit["unit"];
type Draft = {
  role: Choice; location: LocationDraft; earliest: string; latest: string; seats: number; vehicle: boolean;
  detourUnit: DetourUnit; detourValues: Record<DetourUnit, number>;
};
const detourLabel: Record<DetourUnit, string> = { minutes: "min", km: "km" };
const steps = ["About you", "Going to the event", "Leaving the event", "Review and submit"];
const choices: { value: Choice; label: string; icon: ReactNode }[] = [
  { value: "PASSENGER", label: "I need a ride", icon: <UserRound size={20} /> },
  { value: "DRIVER", label: "I can drive", icon: <CarFront size={20} /> },
  { value: "NONE", label: "Skip this trip", icon: <X size={20} /> },
];

function TripFields({ event, leg, value, onChange }:
  { event: PublicEvent; leg: Leg; value: Draft; onChange: (draft: Draft) => void }) {
  const outbound = leg === "TO_EVENT";
  const driver = value.role === "DRIVER";
  const detourValue = value.detourValues[value.detourUnit];
  return <>
    <fieldset className="choice-set">
      <legend>How are you traveling?</legend>
      <div className="choices">
        {choices.map(({ value: option, label, icon }) => <label className="choice" key={option}>
          <input type="radio" name={leg} value={option} checked={value.role === option}
            onChange={() => onChange({ ...value, role: option, vehicle: false })} />
          <span>{icon}{label}</span>
        </label>)}
      </div>
    </fieldset>
    {value.role !== "NONE" && <>
      <LocationPicker value={value.location} onChange={(location) => onChange({ ...value, location })}
        center={event.venue} hubs={outbound && !driver ? event.hubs : []}
        label={outbound ? (driver ? "Where will you start driving?" : "Where can you be picked up?")
          : (driver ? "Where is your final destination?" : "Where should you be dropped off?")}
        labelPlaceholder="e.g. Library entrance" />
      <p className="field-hint">Choose a public, accessible meeting point where possible.</p>
      <div className="field-grid">
        <label className="field"><span>{outbound ? (driver ? "Earliest departure" : "Earliest pickup") : "Earliest departure from venue"}</span>
          <input type="datetime-local" required value={value.earliest}
            onInput={(e) => onChange({ ...value, earliest: e.currentTarget.value })} /></label>
        {(!outbound || !driver) && <label className="field">
          <span>{outbound ? "Latest pickup" : "Latest departure"} <small>Optional</small></span>
          <input type="datetime-local" min={value.earliest || undefined} value={value.latest}
            onInput={(e) => onChange({ ...value, latest: e.currentTarget.value })} />
        </label>}
      </div>
      <p className="field-hint">Times are in {event.timezone}. {(!outbound || !driver) && "Leave the latest time blank if you’re flexible."}</p>
      {driver && <>
        <div className="field-grid">
          <label className="field"><span>Passenger seats</span>
            <select value={value.seats} onChange={(e) => onChange({ ...value, seats: Number(e.target.value) })}>
              {[1, 2, 3].map((seats) => <option key={seats} value={seats}>{seats}</option>)}
            </select>
          </label>
          <fieldset className="field detour-limit">
            <legend>Maximum detour</legend>
            <div>
              <input type="number" min={0} max={value.detourUnit === "minutes" ? 120 : undefined}
                step={value.detourUnit === "minutes" ? 1 : "any"} required
                aria-label="Maximum detour" aria-describedby="detour-estimate-hint"
                value={Number.isNaN(detourValue) ? "" : detourValue}
                onChange={(e) => onChange({ ...value, detourValues: { ...value.detourValues, [value.detourUnit]: e.target.valueAsNumber } })} />
              <select aria-label="Detour unit" value={value.detourUnit}
                onChange={(e) => onChange({ ...value, detourUnit: e.target.value === "km" ? "km" : "minutes" })}>
                <option value="minutes">Minutes</option>
                <option value="km">Kilometers</option>
              </select>
            </div>
          </fieldset>
        </div>
        <p id="detour-estimate-hint" className="field-hint">Matching estimates extra distance from straight-line distances. Time estimates also include a brief allowance for each stop.</p>
        <label className="checkbox"><input type="checkbox" checked={value.vehicle} required
          onChange={(e) => onChange({ ...value, vehicle: e.target.checked })} /> <span>
          I’ll have a vehicle available {outbound ? "at my starting point" : "at the event venue"}.
        </span></label>
      </>}
    </>}
  </>;
}

export function RegistrationForm({ event, token, id, proof }: { event: PublicEvent; token: string; id: string; proof: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, dispatch, pending] = useActionState(register.bind(null, token, proof), {});
  const initial = {
    role: "NONE" as const, location: emptyLocation, seats: 1, vehicle: false,
    detourUnit: "minutes" as const, detourValues: { minutes: 15, km: 5 },
  };
  const [outbound, setOutbound] = useState<Draft>({ ...initial, earliest: localInput(
    new Date(Date.parse(event.starts_at) - 60 * 60_000).toISOString(), event.timezone), latest: "" });
  const [returning, setReturning] = useState<Draft>({ ...initial, earliest: localInput(event.ends_at, event.timezone), latest: localInput(
    new Date(Date.parse(event.ends_at) + 30 * 60_000).toISOString(), event.timezone) });

  useEffect(() => { if (step > 0) heading.current?.focus(); }, [step]);

  function validation(value: Draft, leg: Leg) {
    if (value.role === "NONE") return "";
    if (!hasPoint(value.location) || !value.location.label.trim()) return "Add a location label and choose a point on the map.";
    const earliest = readLocal(value.earliest, event.timezone);
    const latest = value.latest ? readLocal(value.latest, event.timezone) : null;
    if (!earliest || (value.latest && !latest) || (latest && latest < earliest)) return "Check the start and end of your availability.";
    if (leg === "TO_EVENT" && Date.parse(earliest) > Date.parse(event.starts_at)) return "Choose a time by the event start.";
    if (leg === "FROM_EVENT" && latest && Date.parse(latest) < Date.parse(event.ends_at)) return "Choose a window that includes a time after the event ends.";
    return "";
  }

  const drafts = [{ leg: "TO_EVENT" as const, ...outbound }, { leg: "FROM_EVENT" as const, ...returning }];
  const trips = drafts.filter((trip) => trip.role !== "NONE");
  const payload = {
    id, displayName: name, contact, consent,
    trips: trips.map(({ detourUnit, detourValues, ...trip }) => ({
      ...trip,
      latest: trip.role === "DRIVER" && trip.leg === "TO_EVENT" ? undefined : trip.latest || undefined,
      detourLimit: trip.role === "DRIVER" ? { unit: detourUnit, value: detourValues[detourUnit] } : undefined,
    })),
  };

  return <section className="card registration-card">
    <ol className="progress-list" aria-label="Registration progress">
      {steps.map((title, index) => <li key={title} className={index <= step ? "current" : ""}
        aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={14} /> : index + 1}</span>
        <small>{title}</small>
      </li>)}
    </ol>
    <form action={dispatch} className="form-section" onSubmit={(e) => {
      if (step === 3 && trips.length) return;
      e.preventDefault();
      const message = step === 0 ? (!name.trim() ? "Enter your display name." : "")
        : step === 1 ? validation(outbound, "TO_EVENT") : step === 2
          ? validation(returning, "FROM_EVENT") || (!trips.length ? "Choose at least one trip before continuing." : "")
          : "Choose at least one trip before submitting.";
      setError(message);
      if (!message && step < 3) setStep(step + 1);
    }}>
      <h2 tabIndex={-1} ref={heading}>{steps[step]}</h2>
      {step === 0 && <>
        <label className="field"><span>Display name</span><input autoComplete="name" required maxLength={70} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
        <label className="field"><span>Contact details <small>Optional</small></span>
          <input maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email, phone, or messaging handle" />
        </label>
        <label className="checkbox"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to share relevant contact and location details with the organizer and my assigned carpool.</span>
        </label>
      </>}
      {step === 1 && <TripFields key="outbound" event={event} leg="TO_EVENT" value={outbound}
        onChange={(draft) => setOutbound({ ...draft, latest: draft.role === "DRIVER" ? "" : draft.latest })} />}
      {step === 2 && <TripFields key="return" event={event} leg="FROM_EVENT" value={returning} onChange={setReturning} />}
      {step === 3 && <>
        <p><strong>{name}</strong>{contact && <> · {contact}</>}</p>
        <div className="review-grid">
          {drafts.map((trip) => <div className="review-item" key={trip.leg}>
            <h3>{LEG_LABEL[trip.leg]}</h3>
            {trip.role === "NONE" ? <p className="muted">Skipped</p> : <>
              <p>{trip.role === "DRIVER" ? `Driving · ${trip.seats} passenger seat${trip.seats === 1 ? "" : "s"}` : "Needs a ride"}</p>
              {trip.role === "DRIVER" && <p className="muted">Up to {trip.detourValues[trip.detourUnit]} {detourLabel[trip.detourUnit]} of extra travel</p>}
              <p><strong>{trip.location.label}</strong></p>
              <p className="muted">{formatTime(readLocal(trip.earliest, event.timezone)!, event.timezone, true)}
                {trip.latest ? ` to ${formatTime(readLocal(trip.latest, event.timezone)!, event.timezone)}` : " or later"}</p>
            </>}
          </div>)}
        </div>
        <input name="registration" type="hidden" value={JSON.stringify(payload)} />
      </>}
      <Feedback state={{ error: error || (step === 3 ? state.error : undefined) }} />
      <div className="spread form-navigation">
        {step > 0 ? <Button disabled={pending} variant="secondary" onClick={() => { setError(""); setStep(step - 1); }}>Back</Button> : <span />}
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle size={16} className="spin" />}
          {step === 3 ? (pending ? "Submitting…" : "Submit registration") : "Continue"}
        </Button>
      </div>
    </form>
  </section>;
}
