"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TripPlaceReference } from "@/lib/server/trip/place/contract";
import { isCanonicalTripPlaceReference } from "@/lib/server/trip/place/contract";
import styles from "./TripCanvas.module.css";

export function TripPlaceView({ tripId }: { tripId: string }) {
  const [places, setPlaces] = useState<readonly TripPlaceReference[] | null>(null);
  useEffect(() => { let active = true; void fetch(`/api/trips/${tripId}/places`, { cache: "no-store" }).then(async (response) => { if (active && response.ok) setPlaces(await response.json() as TripPlaceReference[]); }).catch(() => undefined); return () => { active = false; }; }, [tripId]);
  return <aside className={styles.panel}><p className={styles.eyebrow}>Place view</p><h2>Exact references</h2><p className={styles.schematic}>Schematic only · no map provider or live route data.</p>{places === null ? <p>Loading place references…</p> : places.length === 0 ? <p>No Trip place references have been recorded.</p> : <ul className={styles.places}>{places.map((place) => <li key={place.id}><strong>{isCanonicalTripPlaceReference(place) ? "Canonical place" : place.label}</strong><span>{place.freshness === "recheck_required" ? "Recheck required" : "Recorded reference"}</span>{isCanonicalTripPlaceReference(place) ? <Link href={`/visepanda/ask?tripId=${tripId}&poiId=${place.canonicalPoiId}`}>Ask about this exact place</Link> : <span>User reference — POI identity not inferred</span>}</li>)}</ul>}</aside>;
}
