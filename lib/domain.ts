import type { AssignmentStatus, DetourLimit, Leg, Location, Route, Trip } from "./matching/types";

export type PublicEvent = {
  name: string;
  organization_name: string | null;
  description: string | null;
  venue: Location;
  starts_at: string;
  ends_at: string;
  timezone: string;
  registration_deadline: string;
  hubs: Location[];
};

export type EventRow = PublicEvent & {
  id: string;
  organizer_id: string;
  public_token: string;
  created_at: string;
  revision: number;
  is_demo: boolean;
};

export type Participant = { id: string; display_name: string; contact_value: string | null; created_at: string; has_my_ride?: boolean };

export type TripRow = {
  id: string;
  event_id: string;
  participant_id: string;
  leg: Leg;
  role: "DRIVER" | "PASSENGER";
  location: Location;
  earliest_at: string;
  latest_at: string | null;
  seats: number | null;
  detour_minutes: number | null;
  detour_km?: number | null;
};

export type RunRow = {
  id: string;
  leg: Leg;
  status: "PROPOSED" | "APPROVED" | "SUPERSEDED";
  revision: number;
  created_at: string;
  unmatched_ids: string[];
};

export type RouteView = Route & {
  id: string;
  driverName: string;
  offeredSeats: number;
  status: AssignmentStatus;
  routeVersion?: number;
  stops: (Route["stops"][number] & { name: string })[];
};

export const eventTiming = (event: PublicEvent) => ({
  venue: event.venue,
  startsAt: Date.parse(event.starts_at),
  endsAt: Date.parse(event.ends_at),
});

export function detourColumns(limit: DetourLimit | null) {
  return {
    detour_minutes: limit?.unit === "minutes" ? limit.value : null,
    detour_km: limit?.unit === "km" ? limit.value : null,
  };
}

export function engineTrip(row: TripRow): Trip {
  const base = {
    id: row.id, leg: row.leg, location: row.location,
    window: { earliest: Date.parse(row.earliest_at), latest: row.latest_at ? Date.parse(row.latest_at) : undefined },
  };
  return row.role === "DRIVER"
    ? { ...base, role: "DRIVER", seats: row.seats!, detourLimit: row.detour_km == null
      ? { unit: "minutes", value: row.detour_minutes! } : { unit: "km", value: row.detour_km } }
    : { ...base, role: "PASSENGER" };
}
