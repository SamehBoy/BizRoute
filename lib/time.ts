import { DateTime } from "luxon";

export function readLocal(value: string, zone: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const parsed = DateTime.fromISO(value, { zone });
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== value || parsed.getPossibleOffsets().length !== 1) {
    return null;
  }
  return parsed.toUTC().toISO();
}

export function localInput(value: string, zone: string) {
  return DateTime.fromISO(value, { zone }).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function formatTime(value: string | number, zone: string, withDate = false) {
  const date = typeof value === "number" ? DateTime.fromMillis(value, { zone }) : DateTime.fromISO(value, { zone });
  return date.setLocale("en").toLocaleString(withDate
    ? { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export function deadlinePassed(iso: string) {
  return Date.parse(iso) <= Date.now();
}
