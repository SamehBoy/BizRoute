import "server-only";
import { notFound } from "next/navigation";
import { engineTrip, eventTiming, type EventRow, type Participant, type RunRow, type TripRow, type PublicEvent, type RouteView } from "./domain";
import { suggestCoordination } from "./matching";
import type { AssignmentStatus, Leg, Location } from "./matching/types";
import { privateSupabase } from "./supabase/config";
import { service } from "./supabase/server";
import { tokenHash } from "./tokens";
import { eventToken, rideToken, uuid } from "./validation";

type Assignment = {
  id: string;
  match_run_id: string;
  driver_trip_request_id: string;
  rider_ids: string[];
  rider_details?: { id: string; location: Location | null; shift_minutes: number }[];
  extra_km: number;
  departure_at: string;
  status: AssignmentStatus;
  route_version?: number;
};
export type Workspace = {
  event: EventRow & { registration_open: boolean };
  participants: Participant[];
  trips: TripRow[];
  runs: RunRow[];
  history: Pick<RunRow, "id" | "leg" | "status" | "created_at">[];
  assignments: Assignment[];
  declined_driver_ids: string[];
};

export type PublicSignup = PublicEvent & { id: string; is_demo: boolean; registration_open: boolean };

export async function loadPublicSignup(token: string): Promise<PublicSignup | null> {
  if (!privateSupabase() || !eventToken.safeParse(token).success) return null;
  const { data, error } = await service().from("events").select(
    "id,name,organization_name,description,venue,starts_at,ends_at,timezone,registration_deadline,hubs,is_demo,registration_open",
  ).eq("public_token", token).maybeSingle();
  if (error) throw new Error("Could not load this event");
  return data;
}

export async function loadWorkspace(id: string, owner: string): Promise<Workspace> {
  if (!uuid.safeParse(id).success) notFound();
  const { data, error } = await service().rpc("organizer_workspace", { p_event: id, p_owner: owner });
  if (error) throw new Error("Could not load this event");
  if (!data) notFound();
  return data;
}

export function tripRoster(workspace: Workspace) {
  const people = new Map(workspace.participants.map((person) => [person.id, person]));
  return new Map(workspace.trips.map((trip) => {
    const person = people.get(trip.participant_id)!;
    return [trip.id, { ...trip, name: person.display_name, contact: person.contact_value }];
  }));
}

export function routesForRun(workspace: Workspace, run: RunRow): RouteView[] {
  const roster = tripRoster(workspace);
  return workspace.assignments.filter((assignment) => assignment.match_run_id === run.id).map((assignment) => {
    const driver = roster.get(assignment.driver_trip_request_id)!;
    const outbound = run.leg === "TO_EVENT";
    return {
      id: assignment.id,
      driverId: driver.id,
      driverName: driver.name,
      offeredSeats: driver.seats!,
      status: assignment.status,
      routeVersion: assignment.route_version ?? 0,
      origin: outbound ? driver.location : workspace.event.venue,
      destination: outbound ? workspace.event.venue : driver.location,
      departureAt: Date.parse(assignment.departure_at),
      extraKm: assignment.extra_km,
      stops: (assignment.rider_details ?? assignment.rider_ids.map((id) => ({ id, location: null, shift_minutes: 0 }))).map(({ id, location, shift_minutes }) => {
        const rider = roster.get(id)!;
        return { passengerId: id, name: rider.name, location: location ?? rider.location, shiftMinutes: shift_minutes };
      }),
    };
  });
}

export function coordinationContext(workspace: Workspace, leg: Leg, routes: RouteView[]) {
  const excludedDrivers = new Set(workspace.declined_driver_ids);
  const lockedDrivers = new Set<string>();
  for (const route of routes) {
    if (route.status === "DECLINED" || route.status === "CANCELLED") excludedDrivers.add(route.driverId);
    if (route.status === "CONFIRMED") lockedDrivers.add(route.driverId);
  }
  return {
    excludedDrivers, lockedDrivers,
    activeRoutes: routes.filter((route) => route.status === "PROPOSED" || route.status === "CONFIRMED"),
    trips: workspace.trips.filter((trip) => trip.leg === leg).map(engineTrip),
  };
}

export function coordinationSuggestions(workspace: Workspace, leg: Leg, context: ReturnType<typeof coordinationContext>) {
  return suggestCoordination(leg, eventTiming(workspace.event), context.trips, context.activeRoutes, {
    excludedDrivers: context.excludedDrivers, lockedDrivers: context.lockedDrivers, hubs: workspace.event.hubs,
  });
}

export type RideResult = {
  event: string;
  timezone: string;
  venue: Location;
  leg: Leg;
  role: TripRow["role"];
  location: Location;
  status: AssignmentStatus | "PENDING" | "UNMATCHED";
  driver?: { name: string; contact: string | null };
  riders?: { name: string; contact: string | null; location: Location }[];
  departureAt?: string;
  assignmentId?: string;
  routeVersion?: number;
  updatedWindow?: { earliest: string; latest: string | null };
  extraKm?: number;
};

export async function loadRide(token: string): Promise<RideResult | null> {
  if (!privateSupabase() || !rideToken.safeParse(token).success) return null;
  const { data, error } = await service().rpc("read_carpool_ride", { p_hash: tokenHash(token) });
  if (error) throw new Error("Could not load this ride");
  return data;
}

export type GuestRegistration = {
  eventId: string;
  eventToken: string;
  eventName: string;
  guestName: string;
  trips: { tripId: string; ride: RideResult }[];
};

export async function loadGuestRegistration(token: string): Promise<GuestRegistration | null> {
  if (!privateSupabase() || !rideToken.safeParse(token).success) return null;
  const { data, error } = await service().rpc("read_carpool_registration", { p_hash: tokenHash(token) });
  if (error) throw new Error("Could not load your rides");
  return data;
}
