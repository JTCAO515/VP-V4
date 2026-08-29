"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import {
  getLocaleAttributes,
  localeOptions,
  tripCanvasCopy,
  type Locale,
} from "@/lib/i18n";
import styles from "./TripListWorkspace.module.css";

type TripSnapshot = Readonly<{
  id: string;
  title: string;
  headVersion: number;
  updatedAt: string;
}>;
type TripListResponse = Readonly<{
  trips: readonly TripSnapshot[];
  currentTripId: string | null;
}>;
type CreateTripResponse = Readonly<{ trip: TripSnapshot; reused: boolean }>;
type LoadState = "loading" | "ready" | "unavailable" | "unauthenticated";

export function TripListWorkspace() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("zh");
  const [state, setState] = useState<LoadState>("loading");
  const [trips, setTrips] = useState<readonly TripSnapshot[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const createId = useRef<string | null>(null);
  const copy = tripCanvasCopy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/trips", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) return setState("unauthenticated");
        if (!response.ok) return setState("unavailable");
        const data = (await response.json()) as TripListResponse;
        setTrips(data.trips);
        setState("ready");
      } catch {
        if (active) setState("unavailable");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const tripId = createId.current ?? crypto.randomUUID();
    createId.current = tripId;
    setCreating(true);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, title: title.trim() || copy.title }),
      });
      if (response.status === 401) return setState("unauthenticated");
      if (!response.ok) return setState("unavailable");
      const data = (await response.json()) as CreateTripResponse;
      router.push(`/visepanda/trips/${data.trip.id}`);
    } catch {
      setState("unavailable");
    } finally {
      setCreating(false);
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/visepanda" aria-label={copy.home}>
          <VisePandaMark />
        </Link>
        <Link className={styles.back} href="/visepanda">
          {copy.back}
        </Link>
        <label className={styles.language}>
          {copy.language}
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className={styles.lede}>{copy.lede}</p>
        {state === "unauthenticated" ? (
          <section className={styles.status}>
            <p>{copy.signInBody}</p>
            <Link className={styles.primary} href="/auth/sign-in?returnTo=/visepanda/trips">
              {copy.signIn}
            </Link>
          </section>
        ) : null}
        {state === "loading" || state === "unavailable" ? (
          <section className={styles.status} aria-live="polite">
            <p>{state === "loading" ? copy.loading : copy.unavailable}</p>
          </section>
        ) : null}
        {state === "ready" ? (
          <>
            <form className={styles.create} onSubmit={(event) => void createTrip(event)}>
              <label htmlFor="trip-title">{copy.title}</label>
              <input
                id="trip-title"
                value={title}
                maxLength={160}
                placeholder={copy.title}
                disabled={creating}
                onChange={(event) => {
                  createId.current = null;
                  setTitle(event.target.value);
                }}
              />
              <button className={styles.primary} type="submit" disabled={creating} aria-label={copy.title}>
                {creating ? copy.loading : "+"}
              </button>
            </form>
            {trips.length === 0 ? (
              <section className={styles.empty}>{copy.noChanges}</section>
            ) : (
              <ol className={styles.list}>
                {trips.map((trip) => (
                  <li key={trip.id}>
                    <Link href={`/visepanda/trips/${trip.id}`}>
                      <strong>{trip.title}</strong>
                      <span>{copy.currentVersion} v{trip.headVersion}</span>
                      <time dateTime={trip.updatedAt}>{copy.updated} {formatDate(trip.updatedAt)}</time>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
