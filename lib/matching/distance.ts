import type { Location } from "./types";

export type Distance = (from: Location, to: Location) => number;

export const haversineKm: Distance = (from, to) => {
  const radians = Math.PI / 180;
  const halfLat = ((to.lat - from.lat) * radians) / 2;
  const halfLng = ((to.lng - from.lng) * radians) / 2;
  const value = Math.sin(halfLat) ** 2 +
    Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(halfLng) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
};

export const PROXY_KMH = 35;
export const STOP_MINUTES = 2;
export const MINUTE = 60_000;
export const travelMs = (km: number) => (km / PROXY_KMH) * 60 * MINUTE;
export const estimateDetourMinutes = (extraKm: number, stops: number) =>
  travelMs(extraKm) / MINUTE + stops * STOP_MINUTES;
