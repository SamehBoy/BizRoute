export const LEGS = ["TO_EVENT", "FROM_EVENT"] as const;
export type Leg = (typeof LEGS)[number];

export const LEG_LABEL: Record<Leg, string> = {
  TO_EVENT: "To the event",
  FROM_EVENT: "From the event",
};

export type Location = { lat: number; lng: number; label: string };
export type Window = { earliest: number; latest?: number };
export type DetourLimit = { unit: "minutes" | "km"; value: number };

export type Trip = {
  id: string;
  leg: Leg;
  location: Location;
  window: Window;
} & ({ role: "PASSENGER" } | { role: "DRIVER"; seats: number; detourLimit: DetourLimit });

export type EventTiming = {
  venue: Location;
  startsAt: number;
  endsAt: number;
};

export type Route = {
  driverId: string;
  origin: Location;
  destination: Location;
  stops: { passengerId: string; location: Location; shiftMinutes?: number }[];
  extraKm: number;
  departureAt: number;
};

export type MatchResult = { routes: Route[]; unmatchedIds: string[]; matched: number; extraKm: number };
export type AssignmentStatus = "PROPOSED" | "CONFIRMED" | "DECLINED" | "CANCELLED";
export type UnmatchedReason = "NO_DRIVERS" | "CAPACITY" | "DETOUR" | "TIMING" | "TIMING_OR_DETOUR" | "OPEN_SEAT";

export type CoordinationChange =
  | { kind: "DIRECT" }
  | { kind: "HUB"; hubIndex: number }
  | { kind: "TIMING"; shiftMinutes: number };

export type CoordinationSuggestion = {
  change: CoordinationChange;
  route: Route;
  stopIndex: number;
  addedKm: number;
  locked: boolean;
};
