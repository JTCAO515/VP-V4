"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TripPlaceReference } from "@/lib/server/trip/place/contract";
import { isCanonicalTripPlaceReference } from "@/lib/server/trip/place/contract";
import { tripPlaceCopy, type Locale } from "@/lib/i18n";
import styles from "./TripCanvas.module.css";

export function TripPlaceView({ tripId, locale }: { tripId: string; locale: Locale }) {
  const [places, setPlaces] = useState<readonly TripPlaceReference[] | null>(null);
  const copy = tripPlaceCopy[locale];
  useEffect(() => { setPlaces(null); let active = true; void fetch(`/api/trips/${tripId}/places`, { cache: "no-store" }).then(async (response) => { if (!active || !response.ok) return; const recorded = await response.json() as TripPlaceReference[]; if (active) setPlaces(recorded); }).catch(() => undefined); return () => { active = false; }; }, [tripId]);
  return <aside className={styles.panel}><p className={styles.eyebrow}>{copy.eyebrow}</p><h2>{copy.title}</h2><p className={styles.schematic}>{copy.schematic}</p>{places === null ? <p>{copy.loading}</p> : places.length === 0 ? <p>{copy.empty}</p> : <ul className={styles.places}>{places.map((place) => <li key={place.id}><strong>{isCanonicalTripPlaceReference(place) ? copy.canonical : place.label}</strong><span>{place.freshness === "recheck_required" ? copy.recheck : copy.recorded}</span>{isCanonicalTripPlaceReference(place) ? <Link href={`/visepanda/ask?tripId=${tripId}&poiId=${place.canonicalPoiId}`}>{copy.ask}</Link> : <span>{copy.user}</span>}</li>)}</ul>}</aside>;
}
