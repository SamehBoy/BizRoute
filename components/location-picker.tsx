"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import type { Map as LeafletMap, Marker, LatLng, DivIcon } from "leaflet";
import type { Location } from "@/lib/matching/types";
import { Button } from "./ui/button";

export type LocationDraft = { lat: number | null; lng: number | null; label: string };
export const emptyLocation: LocationDraft = { lat: null, lng: null, label: "" };
export const hasPoint = (value: LocationDraft): value is Location =>
  value.lat !== null && value.lng !== null && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;

function displayCoord(value: number) {
  return Number(value.toFixed(6));
}

function readCoord(value: string, limit: number) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Math.abs(number) <= limit ? number : null;
}

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const customCredit = (process.env.NEXT_PUBLIC_MAP_TILE_CREDIT || "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function InteractiveMap({ centerLat, centerLng, zoom, lat, lng, onPick }:
  { centerLat: number; centerLng: number; zoom: number; lat: number | null; lng: number | null;
    onPick: (lat: number, lng: number) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const icon = useRef<DivIcon | null>(null);
  const click = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => { click.current = onPick; }, [onPick]);

  useEffect(() => {
    let disposed = false;
    let current: LeafletMap | undefined;
    import("leaflet").then((L) => {
      if (disposed || !element.current) return;
      current = L.map(element.current, { scrollWheelZoom: false }).setView([centerLat, centerLng], zoom);
      map.current = current;
      icon.current = L.divIcon({
        className: "leaflet-carpool-pin", html: '<span aria-hidden="true"></span>',
        iconSize: [26, 26], iconAnchor: [13, 23],
      });
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>' +
          (customCredit ? ` · ${customCredit}` : ""),
      }).on("tileerror", () => setTileError(true)).addTo(current);
      current.on("click", (event: { latlng: LatLng }) => {
        const point = event.latlng.wrap();
        click.current(displayCoord(point.lat), displayCoord(point.lng));
      });
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      current?.remove();
      map.current = null;
      marker.current = null;
      icon.current = null;
    };
  }, [centerLat, centerLng, zoom]);

  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    if (lat === null || lng === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !icon.current) return;
      const point: [number, number] = [lat, lng];
      if (marker.current) marker.current.setLatLng(point);
      else marker.current = L.marker(point, { icon: icon.current, interactive: false, keyboard: false }).addTo(current);
      if (!current.getBounds().contains(point)) current.panTo(point, { animate: false });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, [lat, lng, ready, centerLat, centerLng, zoom]);

  return <>
    <div className="leaflet-wrap">
      <div ref={element} className="leaflet-map" aria-label="Location map. Use arrow keys to pan, or enter coordinates below." />
      {!ready && <p className="map-status">{failed ? "Map unavailable. Enter coordinates below." : "Loading map…"}</p>}
    </div>
    <div className="map-controls">
      <Button variant="secondary" size="small" disabled={!ready || failed} onClick={() => {
        const point = map.current?.getCenter().wrap();
        if (point) click.current(displayCoord(point.lat), displayCoord(point.lng));
      }}><Crosshair size={15} /> Select map center</Button>
      <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Report a map issue</a>
    </div>
    {tileError && <small className="muted">Some map tiles are unavailable. You can enter coordinates below.</small>}
  </>;
}

export function LocationPicker({ value, onChange, center, hubs = [], label = "Location label", labelPlaceholder = "e.g. Main entrance" }: {
  value: LocationDraft; onChange: (value: LocationDraft) => void; center?: Location;
  hubs?: Location[]; label?: string; labelPlaceholder?: string;
}) {
  const id = useId();
  const [manual, setManual] = useState<{ lat: string; lng: string } | null>(null);
  const fields = manual ?? { lat: value.lat?.toString() ?? "", lng: value.lng?.toString() ?? "" };

  function pick(lat: number, lng: number) {
    setManual(null);
    onChange({ ...value, lat, lng });
  }

  function edit(field: "lat" | "lng", text: string) {
    const updated = { ...fields, [field]: text };
    setManual(updated);
    onChange({ ...value, lat: readCoord(updated.lat, 90), lng: readCoord(updated.lng, 180) });
  }

  return <div className="location-picker">
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })}
        maxLength={120} placeholder={labelPlaceholder} required />
    </label>
    {hubs.length > 0 && <div className="hub-choices"><span>Suggested pickup hubs</span>
      <div className="cluster">{hubs.map((hub, index) => <Button key={index} variant="secondary" size="small" onClick={() => {
        setManual(null);
        onChange(hub);
      }}><MapPin size={15} />{hub.label}</Button>)}</div>
    </div>}
    <p className="field-hint">Select a point on the map or enter its coordinates.</p>
    <InteractiveMap centerLat={center?.lat ?? 20} centerLng={center?.lng ?? 0} zoom={center ? 11 : 2}
      lat={value.lat} lng={value.lng} onPick={pick} />
    <details className="coordinates">
      <summary>Enter coordinates manually{hasPoint(value) && <span>{value.lat.toFixed(4)}, {value.lng.toFixed(4)}</span>}</summary>
      <div className="field-grid">
        <label className="field"><span>Latitude</span><input inputMode="decimal" placeholder="e.g. 47.6219"
          value={fields.lat} onChange={(event) => edit("lat", event.target.value)} /></label>
        <label className="field"><span>Longitude</span><input inputMode="decimal" placeholder="e.g. −122.3506"
          value={fields.lng} onChange={(event) => edit("lng", event.target.value)} /></label>
      </div>
    </details>
  </div>;
}
