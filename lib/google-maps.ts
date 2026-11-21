import type { Location } from "./matching/types";

const coordinates = ({ lat, lng }: Location) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
const mobileStops = 3;

export function googleMapsLinks(origin: Location, stops: Location[], destination: Location): string[] {
  const points = [origin, ...stops, destination];
  const links: string[] = [];
  for (let index = 0; index < points.length - 1; index += mobileStops + 1) {
    const segment = points.slice(index, index + mobileStops + 2);
    const params = new URLSearchParams({
      api: "1",
      origin: coordinates(segment[0]),
      destination: coordinates(segment.at(-1)!),
      travelmode: "driving",
    });
    if (segment.length > 2) params.set("waypoints", segment.slice(1, -1).map(coordinates).join("|"));
    links.push(`https://www.google.com/maps/dir/?${params}`);
  }
  return links;
}
