"use client";

import { useActionState, useState, type FormEvent } from "react";
import { CalendarPlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createEvent } from "@/app/actions";
import { emptyLocation, hasPoint, LocationPicker, type LocationDraft } from "./location-picker";
import { Feedback } from "./ui/form";
import { Button } from "./ui/button";

export function EventForm() {
  const [venue, setVenue] = useState<LocationDraft>(emptyLocation);
  const [hubs, setHubs] = useState<{ key: number; point: LocationDraft }[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(createEvent, {});
  const [details, setDetails] = useState({ name: "", organization_name: "", description: "" });
  const [zone, setZone] = useState("UTC");
  const [dates, setDates] = useState({ starts_at: "", ends_at: "", registration_deadline: "" });
  const regions = ["UTC", ...Intl.supportedValuesOf("timeZone")];

  function validate(event: FormEvent<HTMLFormElement>) {
    if (!hasPoint(venue) || hubs.some(({ point }) => !hasPoint(point))) {
      event.preventDefault();
      setError("Choose a point for the venue and each suggested pickup hub.");
    } else setError("");
  }

  return <form action={(data) => {
    const fields = Object.fromEntries(data);
    data.set("event", JSON.stringify({ ...fields, venue, hubs: hubs.map(({ point }) => point) }));
    action(data);
  }} onSubmit={validate} className="form-stack">
    <section className="card form-section">
      <h2>Event details</h2>
      <label className="field"><span>Event name</span><input name="name" value={details.name}
        onChange={(event) => setDetails({ ...details, name: event.target.value })} maxLength={100} placeholder="e.g. Summer picnic" required /></label>
      <label className="field"><span>Organization <small>Optional</small></span><input name="organization_name" value={details.organization_name}
        onChange={(event) => setDetails({ ...details, organization_name: event.target.value })} maxLength={100} /></label>
      <label className="field"><span>Description <small>Optional</small></span><textarea name="description" value={details.description}
        onChange={(event) => setDetails({ ...details, description: event.target.value })} rows={3} maxLength={2000} /></label>
    </section>
    <section className="card form-section">
      <h2>Schedule</h2>
      <label className="field"><span>Event time zone</span><input name="timezone" required maxLength={100} list="time-zones"
        value={zone} onChange={(event) => setZone(event.target.value)} /></label>
      <datalist id="time-zones">{regions.map((region) => <option key={region} value={region} />)}</datalist>
      <Button variant="secondary" size="small" className="self-start" onClick={() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
        Use my time zone
      </Button>
      <div className="field-grid">
        <label className="field"><span>Starts at</span><input type="datetime-local" name="starts_at" required value={dates.starts_at}
          onInput={(event) => setDates({ ...dates, starts_at: event.currentTarget.value })} /></label>
        <label className="field"><span>Expected end</span><input type="datetime-local" name="ends_at" required min={dates.starts_at}
          value={dates.ends_at} onInput={(event) => setDates({ ...dates, ends_at: event.currentTarget.value })} /></label>
      </div>
      <label className="field"><span>Registration deadline</span><input type="datetime-local" name="registration_deadline" required
        max={dates.starts_at || undefined} value={dates.registration_deadline}
        onInput={(event) => setDates({ ...dates, registration_deadline: event.currentTarget.value })} /></label>
    </section>
    <section className="card form-section">
      <h2>Venue</h2>
      <LocationPicker label="Venue name" labelPlaceholder="e.g. Community center" value={venue} onChange={setVenue} />
    </section>
    <section className="card form-section">
      <h2>Suggested pickup hubs</h2>
      <p className="muted">Optional public meeting points guests can choose on the way to the event.</p>
      {hubs.map(({ key, point }, index) => <div className="hub-form" key={key}>
        <div className="spread"><h3>Pickup hub {index + 1}</h3>
          <Button variant="ghost" size="small" onClick={() => setHubs(hubs.filter((hub) => key !== hub.key))}>
            <Trash2 size={15} /> Remove
          </Button>
        </div>
        <LocationPicker value={point} center={hasPoint(venue) ? venue : undefined} onChange={(newPoint) =>
          setHubs(hubs.map((hub) => hub.key === key ? { key, point: newPoint } : hub))} />
      </div>)}
      {hubs.length < 5 && <Button variant="secondary" className="self-start" onClick={() => {
        setHubs([...hubs, { key: nextKey, point: { ...emptyLocation } }]);
        setNextKey(nextKey + 1);
      }}><Plus size={17} /> Add a pickup hub</Button>}
    </section>
    <Feedback state={{ error: error || state.error }} />
    <div><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <CalendarPlus size={18} />}
      {pending ? "Creating event…" : "Create event"}</Button></div>
  </form>;
}
