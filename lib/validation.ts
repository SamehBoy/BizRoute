import { z } from "zod";
import { IANAZone } from "luxon";
import { LEGS } from "./matching/types";
import { readLocal } from "./time";

export const uuid = z.uuid();
export const eventToken = z.string().regex(/^[a-f0-9]{48}$/);
export const rideToken = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const dateInput = z.string().length(16, "Enter a date and time.");
const location = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1, "Enter a location label.").max(120),
});

export const createEventSchema = z.object({
  name: z.string().trim().min(1, "Enter an event name.").max(100),
  organization_name: z.string().trim().max(100),
  description: z.string().trim().max(2000),
  venue: location,
  starts_at: dateInput,
  ends_at: dateInput,
  registration_deadline: dateInput,
  timezone: z.string().trim().max(100).refine((value) => IANAZone.isValidZone(value), "Choose a valid time zone."),
  hubs: z.array(location).max(5),
}).transform((value, context) => {
  const starts = readLocal(value.starts_at, value.timezone);
  const ends = readLocal(value.ends_at, value.timezone);
  const deadline = readLocal(value.registration_deadline, value.timezone);
  if (!starts || !ends || !deadline) {
    context.addIssue({ code: "custom", message: "Choose valid, unambiguous event times in the selected time zone." });
    return z.NEVER;
  }
  if (ends <= starts || deadline > starts || Date.parse(deadline) <= Date.now()) {
    context.addIssue({ code: "custom", message: "Use a future registration deadline by the event start and an end time after the start." });
    return z.NEVER;
  }
  return { ...value, starts_at: starts, ends_at: ends, registration_deadline: deadline,
    description: value.description || null, organization_name: value.organization_name || null };
});

const legBase = { leg: z.enum(LEGS), location, earliest: dateInput, latest: dateInput.optional() };
const detourLimit = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("minutes"), value: z.number().int().min(0).max(120) }),
  z.object({ unit: z.literal("km"), value: z.number().nonnegative() }),
]);
export const coordinationChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DIRECT") }),
  z.object({ kind: z.literal("HUB"), hubIndex: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("TIMING"), shiftMinutes: z.number().int().min(-30).max(30).multipleOf(5)
    .refine((minutes) => minutes !== 0) }),
]);
const trip = z.discriminatedUnion("role", [
  z.object({ ...legBase, role: z.literal("PASSENGER") }),
  z.object({ ...legBase, role: z.literal("DRIVER"), seats: z.number().int().min(1).max(3),
    detourLimit, vehicle: z.literal(true, "Confirm access to a vehicle for this trip.") }),
]);

export const registrationSchema = z.object({
  id: uuid,
  displayName: z.string().trim().min(1, "Enter your name.").max(70),
  contact: z.string().trim().max(120, "Keep contact details under 120 characters."),
  consent: z.literal(true, "Please give consent to share coordination details with your assigned carpool."),
  trips: z.array(trip).min(1, "Select at least one trip.").max(2)
    .refine((value) => new Set(value.map(({ leg }) => leg)).size === value.length, "Each direction can only be selected once."),
});

export const signInSchema = z.object({ email: z.email(), password: z.string().min(1).max(256) });

export function parseJson(form: FormData, key: string): unknown {
  const value = form.get(key);
  if (typeof value !== "string" || value.length > 16_000) return;
  try { return JSON.parse(value); } catch { return; }
}
