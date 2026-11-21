"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { coordinationContext, coordinationSuggestions, loadGuestRegistration, loadPublicSignup, loadWorkspace, routesForRun } from "@/lib/data";
import { upcomingDemo } from "@/lib/demo";
import { detourColumns, engineTrip, eventTiming } from "@/lib/domain";
import { matchTrips, SOLVER_VERSION } from "@/lib/matching";
import { LEGS, type CoordinationChange } from "@/lib/matching/types";
import { forgetRegistration, rememberRegistration } from "@/lib/registration-cookie";
import { privateSupabase } from "@/lib/supabase/config";
import { requireOrganizer, serverAuth, service } from "@/lib/supabase/server";
import { readLocal } from "@/lib/time";
import { issueTrip, newEventToken, registrationToken, tokenHash, tripToken, validRegistrationProof } from "@/lib/tokens";
import { coordinationChangeSchema, createEventSchema, eventToken, parseJson, registrationSchema, rideToken, uuid } from "@/lib/validation";

function feedback(message: string, fallback: string): ActionState {
  if (message === "registration_closed") return { error: "Registration for this event has closed." };
  if (message === "stale_run" || message === "driver_declined") {
    return { error: "Trip availability has changed. Generate a new proposal to continue." };
  }
  if (message === "stale_coordination") return { error: "This option changed. Refresh the match review to see current seats and suggestions." };
  if (message === "ride_unavailable") return { error: "This assignment is no longer current. Refresh your ride details." };
  return { error: fallback };
}

export async function signOut() {
  if (privateSupabase()) {
    const auth = await serverAuth();
    await auth.auth.signOut({ scope: "local" });
  }
  redirect("/");
}

export async function createEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const owner = await requireOrganizer();
  const input = createEventSchema.safeParse(parseJson(form, "event"));
  if (!input.success) return { error: input.error.issues[0]?.message };
  const { data, error } = await service().rpc("create_carpool_event", {
    p_owner: owner.id, p_event: { ...input.data, public_token: newEventToken() }, p_fixtures: [],
  });
  if (error) return { error: "Could not create the event. Please try again." };
  revalidatePath("/dashboard");
  redirect(`/dashboard/events/${data}`);
}

export async function createDemo(_: ActionState): Promise<ActionState> {
  const owner = await requireOrganizer();
  const { event, people } = upcomingDemo();
  const p_fixtures = people.map((person) => ({
    id: randomUUID(),
    name: person.name,
    contact: person.contact,
    trips: person.trips.map((trip) => issueTrip({
      role: trip.role,
      leg: trip.leg,
      location: trip.location,
      earliest_at: new Date(trip.window.earliest).toISOString(),
      latest_at: trip.window.latest ? new Date(trip.window.latest).toISOString() : null,
      seats: trip.role === "DRIVER" ? trip.seats : null,
      ...detourColumns(trip.role === "DRIVER" ? trip.detourLimit : null),
      vehicle_available: trip.role === "DRIVER",
    })),
  }));
  const { data, error } = await service().rpc("create_carpool_event", {
    p_owner: owner.id, p_event: { ...event, public_token: newEventToken() }, p_fixtures,
  });
  if (error) return { error: "Could not create the sample event. Please try again." };
  revalidatePath("/dashboard");
  redirect(`/dashboard/events/${data}`);
}

export async function register(token: string, proof: string, _: ActionState, form: FormData): Promise<ActionState> {
  const event = await loadPublicSignup(token);
  if (!event || event.is_demo) return { error: "This event link cannot accept registrations." };
  const input = registrationSchema.safeParse(parseJson(form, "registration"));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Review your registration details." };
  if (!validRegistrationProof(event.id, input.data.id, proof)) {
    return { error: "This registration form has expired. Open the event link again." };
  }
  const trips = [];
  for (const trip of input.data.trips) {
    const earliest = readLocal(trip.earliest, event.timezone);
    const latest = trip.latest ? readLocal(trip.latest, event.timezone) : null;
    if (!earliest || (trip.latest && !latest) || (latest && latest < earliest)) {
      return { error: "Use valid times in the event time zone and end each window at or after its start." };
    }
    if (trip.leg === "TO_EVENT" ? Date.parse(earliest) > Date.parse(event.starts_at)
      : !!latest && Date.parse(latest) < Date.parse(event.ends_at)) {
      return { error: "Use an outbound availability time by the event start and a return window that covers a time after the event ends." };
    }
    trips.push(issueTrip({
      leg: trip.leg, role: trip.role, location: trip.location, earliest_at: earliest, latest_at: latest,
      seats: trip.role === "DRIVER" ? trip.seats : null,
      ...detourColumns(trip.role === "DRIVER" ? trip.detourLimit : null),
      vehicle_available: trip.role === "DRIVER",
    }));
  }
  const receipt = registrationToken(event.id, input.data.id);
  const { error } = await service().rpc("register_carpool_with_receipt", {
    p_event: event.id, p_participant: input.data.id, p_name: input.data.displayName, p_contact: input.data.contact || null,
    p_consent: input.data.consent, p_trips: trips, p_receipt_hash: tokenHash(receipt),
  });
  if (error) return feedback(error.message, "Could not save your registration. Please try again.");
  await rememberRegistration(token, receipt);
  revalidatePath(`/dashboard/events/${event.id}`);
  redirect(`/my-ride/${receipt}?registered=1`);
}

export async function forgetMyRide(token: string) {
  if (!eventToken.safeParse(token).success) return;
  await forgetRegistration(token);
  redirect(`/e/${token}`);
}

export async function runMatching(id: string, leg: string, _: ActionState): Promise<ActionState> {
  const owner = await requireOrganizer();
  const parsed = z.enum(LEGS).safeParse(leg);
  if (!parsed.success) return { error: "Choose a trip direction." };
  const workspace = await loadWorkspace(id, owner.id);
  const result = matchTrips(parsed.data, eventTiming(workspace.event), workspace.trips.map(engineTrip), {
    excludedDrivers: new Set(workspace.declined_driver_ids),
  });
  const { error } = await service().rpc("save_carpool_run", {
    p_event: id, p_owner: owner.id, p_leg: parsed.data, p_revision: workspace.event.revision,
    p_solver: SOLVER_VERSION, p_unmatched: result.unmatchedIds,
    p_routes: result.routes.map((route) => ({ ...route, departureIso: new Date(route.departureAt).toISOString() })),
  });
  if (error) return feedback(error.message, "Could not save the proposal. Please try again.");
  revalidatePath(`/dashboard/events/${id}`);
  redirect(`/dashboard/events/${id}/matches?leg=${parsed.data}`);
}

export async function approveRun(id: string, run: string, _: ActionState): Promise<ActionState> {
  const owner = await requireOrganizer();
  if (!uuid.safeParse(id).success || !uuid.safeParse(run).success) return { error: "That match run is unavailable." };
  const { error } = await service().rpc("approve_carpool_run", { p_event: id, p_owner: owner.id, p_run: run });
  if (error) return feedback(error.message, "Could not approve the proposal.");
  revalidatePath(`/dashboard/events/${id}`);
  revalidatePath(`/dashboard/events/${id}/matches`);
  return { success: "The run is approved. Guests can now check their private ride details." };
}

export async function addCoordinatedRider(
  id: string, runId: string, passengerId: string, driverId: string, version: number | null,
  change: CoordinationChange, _: ActionState, form: FormData,
): Promise<ActionState> {
  const owner = await requireOrganizer();
  const parsed = coordinationChangeSchema.safeParse(change);
  if (![id, runId, passengerId, driverId].every((value) => uuid.safeParse(value).success) || !parsed.success) {
    return { error: "This coordination option is unavailable." };
  }
  if (change.kind !== "DIRECT" && form.get("agreed") !== "on") {
    return { error: "Confirm that the rider agreed to the updated pickup or timing." };
  }

  const workspace = await loadWorkspace(id, owner.id);
  const run = workspace.runs.find(({ id }) => id === runId);
  if (!run || (run.status === "PROPOSED" && run.revision !== workspace.event.revision)) {
    return feedback("stale_coordination", "");
  }
  const routes = routesForRun(workspace, run);
  const previous = routes.find((route) => route.driverId === driverId);
  const context = coordinationContext(workspace, run.leg, routes);
  const suggestion = coordinationSuggestions(workspace, run.leg, context).get(passengerId)?.find((item) => {
    const candidate = item.change;
    return !item.locked && item.route.driverId === driverId && candidate.kind === change.kind &&
      (candidate.kind !== "HUB" || (change.kind === "HUB" && candidate.hubIndex === change.hubIndex)) &&
      (candidate.kind !== "TIMING" || (change.kind === "TIMING" && candidate.shiftMinutes === change.shiftMinutes));
  });
  if (!suggestion || (previous ? previous.routeVersion ?? 0 : null) !== version) {
    return feedback("stale_coordination", "");
  }

  const { error } = await service().rpc("coordinate_carpool_seat", {
    p_event: id, p_owner: owner.id, p_run: runId, p_run_status: run.status, p_revision: workspace.event.revision,
    p_passenger: passengerId, p_driver: driverId, p_expected_version: version, p_stop_order: suggestion.stopIndex,
    p_extra_km: suggestion.route.extraKm, p_departure_at: new Date(suggestion.route.departureAt).toISOString(),
    p_hub_index: change.kind === "HUB" ? change.hubIndex : null,
    p_shift_minutes: change.kind === "TIMING" ? change.shiftMinutes : 0,
  });
  if (error) return feedback(error.message, "Could not add the rider. Please try again.");
  revalidatePath(`/dashboard/events/${id}`);
  revalidatePath(`/dashboard/events/${id}/matches`);
  return { success: "Rider added. Share the updated ride details with this carpool." };
}

export async function setRegistration(id: string, open: boolean, _: ActionState): Promise<ActionState> {
  const owner = await requireOrganizer();
  const workspace = await loadWorkspace(id, owner.id);
  if (workspace.event.is_demo || (open && Date.parse(workspace.event.registration_deadline) <= Date.now())) {
    return { error: "Registration cannot reopen for this event." };
  }
  const { error } = await service().from("events").update({ registration_open: open })
    .eq("id", id).eq("organizer_id", owner.id);
  if (error) return { error: "Could not update registration." };
  revalidatePath(`/dashboard/events/${id}`);
  return { success: open ? "Registration reopened." : "Registration closed." };
}

export async function deleteEvent(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const owner = await requireOrganizer();
  if (form.get("confirm") !== "on") return { error: "Confirm that you want to permanently delete this event and its participant data." };
  if (!uuid.safeParse(id).success) return { error: "That event is unavailable." };
  const { error } = await service().from("events").delete().eq("id", id).eq("organizer_id", owner.id);
  if (error) return { error: "Could not delete the event." };
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

async function saveRideResponse(
  token: string, assignment: string, version: number | undefined, form: FormData, pagePath: string,
): Promise<ActionState> {
  const response = z.enum(["CONFIRMED", "DECLINED"]).safeParse(form.get("response"));
  if (!privateSupabase() || !response.success || !uuid.safeParse(assignment).success || !rideToken.safeParse(token).success) {
    return { error: "This response could not be validated." };
  }
  const { error } = await service().rpc("record_carpool_response", {
    p_hash: tokenHash(token), p_assignment: assignment, p_response: response.data,
    ...(version === undefined ? {} : { p_version: version }),
  });
  if (error) return feedback(error.message, "Could not save your response.");
  revalidatePath(pagePath);
  return { success: response.data === "CONFIRMED" ? "Your ride is confirmed." : "Your ride was declined." };
}

export async function respondToRide(token: string, assignment: string, version: number | undefined, _: ActionState, form: FormData) {
  return saveRideResponse(token, assignment, version, form, `/ride/${token}`);
}

export async function respondToMyRide(receipt: string, tripId: string, assignment: string, version: number | undefined, _: ActionState, form: FormData) {
  const registration = await loadGuestRegistration(receipt);
  if (!registration?.trips.some((trip) => trip.tripId === tripId && trip.ride.role === "DRIVER")) {
    return { error: "This trip is unavailable through your private ride page." };
  }
  return saveRideResponse(tripToken(tripId), assignment, version, form, `/my-ride/${receipt}`);
}
