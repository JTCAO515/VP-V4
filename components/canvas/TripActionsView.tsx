"use client";

import { useEffect, useState } from "react";
import { projectTripActions, type TripActionReference } from "@/lib/server/trip/actions/contract";
import styles from "./TripCanvas.module.css";

export function TripActionsView({ tripId }: { tripId: string }) {
  const [actions, setActions] = useState<readonly TripActionReference[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { let active = true; setActions(null); setUnavailable(false); void fetch(`/api/trips/${tripId}/actions`, { cache: "no-store" }).then(async (response) => { if (!active) return; if (!response.ok) { setUnavailable(true); return; } const recorded = await response.json() as TripActionReference[]; if (active) setActions(recorded); }).catch(() => { if (active) setUnavailable(true); }); return () => { active = false; }; }, [tripId]);
  const projected = actions === null ? null : projectTripActions(actions);
  return <aside className={styles.panel}><p className={styles.eyebrow}>Reservations & Actions</p><h2>Prepare and hand off</h2><p className={styles.schematic}>No orders, payments, inventory, or provider completion are created here.</p>{unavailable ? <p>Recorded actions are unavailable right now.</p> : projected === null ? <p>Loading recorded actions…</p> : projected.length === 0 ? <p>No ticket, reservation, external-link, or preparation reference has been recorded.</p> : <ul className={styles.places}>{projected.map((action) => <li key={action.id}><strong>{action.label}</strong><span>{action.outcome === "recheck_required" ? "Recheck required" : action.outcome === "unavailable" ? "Unavailable — no recorded external link" : "Recorded external link available"}</span><span>Source: Trip record</span>{action.externalLinkUrl ? <a href={action.externalLinkUrl} rel="noreferrer" target="_blank">Open recorded external link</a> : null}</li>)}</ul>}</aside>;
}
