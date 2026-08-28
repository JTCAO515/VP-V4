"use client";

import { useEffect, useState } from "react";
import { projectTripActions, type TripActionReference } from "@/lib/server/trip/actions/contract";
import { tripActionsCopy, type Locale } from "@/lib/i18n";
import styles from "./TripCanvas.module.css";

export function TripActionsView({ tripId, locale }: { tripId: string; locale: Locale }) {
  const [actions, setActions] = useState<readonly TripActionReference[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const copy = tripActionsCopy[locale];
  useEffect(() => { let active = true; setActions(null); setUnavailable(false); void fetch(`/api/trips/${tripId}/actions`, { cache: "no-store" }).then(async (response) => { if (!active) return; if (!response.ok) { setUnavailable(true); return; } const recorded = await response.json() as TripActionReference[]; if (active) setActions(recorded); }).catch(() => { if (active) setUnavailable(true); }); return () => { active = false; }; }, [tripId]);
  const projected = actions === null ? null : projectTripActions(actions);
  return <aside className={styles.panel}><p className={styles.eyebrow}>{copy.eyebrow}</p><h2>{copy.title}</h2><p className={styles.schematic}>{copy.schematic}</p>{unavailable ? <p>{copy.unavailable}</p> : projected === null ? <p>{copy.loading}</p> : projected.length === 0 ? <p>{copy.empty}</p> : <ul className={styles.places}>{projected.map((action) => <li key={action.id}><strong>{action.label}</strong><span>{action.outcome === "recheck_required" ? copy.recheck : action.outcome === "unavailable" ? copy.missingLink : copy.recordedLink}</span><span>{copy.source}</span>{action.externalLinkUrl ? <a href={action.externalLinkUrl} rel="noreferrer" target="_blank">{copy.open}</a> : null}</li>)}</ul>}</aside>;
}
