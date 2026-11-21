import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { privateSupabase } from "./supabase/config";

export const newEventToken = () => randomBytes(24).toString("hex");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function keyedToken(payload: string) {
  const config = privateSupabase();
  if (!config) throw new Error("Ride-link secret is missing");
  return createHmac("sha256", Buffer.from(config.rideSecret, "hex")).update(payload).digest("base64url");
}

export const tripToken = (tripId: string) => keyedToken(`carpool:ride:${tripId}`);
export const registrationToken = (eventId: string, participantId: string) =>
  keyedToken(`carpool:registration:${eventId}:${participantId}`);
export const registrationProof = (eventId: string, participantId: string) =>
  keyedToken(`carpool:registration-form:${eventId}:${participantId}`);

export function validRegistrationProof(eventId: string, participantId: string, proof: string) {
  if (typeof proof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  const expected = Buffer.from(registrationProof(eventId, participantId));
  const supplied = Buffer.from(proof);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function issueTrip<T extends object>(details: T) {
  const id = randomUUID();
  return { ...details, id, token_hash: tokenHash(tripToken(id)) };
}
