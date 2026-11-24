import { CalendarClock, CarFront, MapPin, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { FormAction } from "@/lib/action-state";
import type { RideResult } from "@/lib/data";
import { formatTime } from "@/lib/time";
import { DetourEstimate, MapActions, RouteStops } from "./matches";
import { Empty } from "./shell";
import { ActionForm } from "./ui/form";

export function RideDetails({ ride, respond, driverActions }: {
  ride: RideResult;
  respond?: FormAction;
  driverActions?: ReactNode;
}) {
  const { driver, riders, departureAt } = ride;
  const isDriver = ride.role === "DRIVER";
  const outbound = ride.leg === "TO_EVENT";
  const origin = outbound ? ride.location : ride.venue;
  const destination = outbound ? ride.venue : ride.location;
  return <div className="ride-detail-stack">
    {driver && departureAt ? <>
      {isDriver && riders && (respond || driverActions) ? <>
        <section className="card match-card">
          <div className="cluster"><div className="feature-icon"><CarFront size={23} /></div>
            <div><h3>Your driving route</h3><p className="muted">{riders.length} passenger{riders.length === 1 ? "" : "s"}</p></div>
          </div>
          <RouteStops origin={origin} destination={destination} stops={riders} leg={ride.leg} />
          <div className="ride-details">
            <p><CalendarClock size={18} />Suggested departure {formatTime(departureAt, ride.timezone, true)}</p>
            {ride.extraKm != null && <p><MapPin size={18} /><span><DetourEstimate extraKm={ride.extraKm} stops={riders.length} /></span></p>}
          </div>
          <p className="muted">Open the route to check road conditions and travel time before confirming. Coordinate exact meetup times with your passengers.</p>
          <MapActions origin={origin} destination={destination} stops={riders.map((rider) => rider.location)} />
        </section>
        <section className="card form-section">
          <h3>Passenger contacts</h3>
          <ul className="ride-contact-list">{riders.map((rider, index) => <li key={index}><UsersRound size={17} />
            <strong>{rider.name}</strong>{rider.contact && <span>{rider.contact}</span>}</li>)}</ul>
        </section>
        <section className="card form-section">
          <h3>{ride.status === "CONFIRMED" ? "Your ride is confirmed" : "Can you drive this route?"}</h3>
          <div className="ride-responses">{driverActions ?? (respond && <>
            {ride.status !== "CONFIRMED" && <ActionForm action={respond} submit="Confirm ride" value="CONFIRMED" />}
            <ActionForm action={respond} submit={ride.status === "CONFIRMED" ? "Withdraw as driver" : "Decline ride"} value="DECLINED" variant="danger">
              {ride.status === "CONFIRMED" && <label className="checkbox"><input type="checkbox" required />
                <span>I can no longer drive this trip.</span></label>}
            </ActionForm>
          </>)}</div>
        </section>
      </> : <section className="card form-section">
        <div className="cluster"><div className="feature-icon"><CarFront size={23} /></div>
          <div><p className="muted">Assigned driver</p><h3>{driver.name}</h3></div>
        </div>
        <div className="ride-details">
          <p><MapPin size={18} />{outbound ? "Pickup" : "Drop-off"} · {ride.location.label}</p>
          <p><CalendarClock size={18} />{outbound ? "Driver’s suggested start" : "Suggested departure"} · {formatTime(departureAt, ride.timezone, true)}</p>
          {ride.updatedWindow && <p><CalendarClock size={18} />Updated {outbound ? "pickup" : "departure"} window · {formatTime(ride.updatedWindow.earliest, ride.timezone)}
            {ride.updatedWindow.latest ? ` to ${formatTime(ride.updatedWindow.latest, ride.timezone)}` : " or later"}</p>}
          {driver.contact && <p><UsersRound size={18} />{driver.contact}</p>}
        </div>
        <p className="muted">{ride.status === "CONFIRMED"
          ? "Coordinate the exact meetup time with your driver."
          : "Your driver still needs to confirm this ride. Check this link again for updates."}</p>
      </section>}
    </> : <Empty title={ride.status === "PENDING" ? "The organizer is reviewing rides" : ride.status === "UNMATCHED"
      ? (isDriver ? "No passengers assigned" : "No driver assigned yet") : "This ride is no longer active"}>
      <p>{ride.status === "PENDING" ? "Check this same link after the organizer approves a match."
        : "Contact the event organizer for updated ride arrangements."}</p>
    </Empty>}
  </div>;
}
