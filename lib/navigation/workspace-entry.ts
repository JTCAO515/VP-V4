import type { Locale } from "@/lib/i18n";

export const DEFAULT_RETURN_TO = "/visepanda" as const;
const allowedReturnTo = new Set(["/", "/auth/sign-in", "/visepanda"] as const);
const locales = new Set<Locale>(["zh", "en", "es", "ru", "ar"]);
const sources = new Set<WorkspaceEntrySource>(["home_hero", "home_flow", "global_nav", "auth"]);
const intents = new Set<WorkspaceEntryIntent>(["create", "adjust", "check", "recover"]);
const presentations = new Set<WorkspaceEntryPresentation>(["preview", "authenticated"]);
const scenarios = new Set<WorkspaceEntryScenarioId>(["first-trip", "readiness", "build-trip", "today-help"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceEntrySource = "home_hero" | "home_flow" | "global_nav" | "auth";
export type WorkspaceEntryIntent = "create" | "adjust" | "check" | "recover";
export type WorkspaceEntryPresentation = "preview" | "authenticated";
export type WorkspaceEntryScenarioId = "first-trip" | "readiness" | "build-trip" | "today-help";
export type WorkspaceEntryContextV1 = Readonly<{ version: 1; source: WorkspaceEntrySource; locale: Locale; intent?: WorkspaceEntryIntent; presentation: WorkspaceEntryPresentation; scenarioId?: WorkspaceEntryScenarioId; tripId?: string }>;

export function safeReturnTo(candidate: string | null | undefined): typeof DEFAULT_RETURN_TO | "/" | "/auth/sign-in" {
  if (!candidate) return DEFAULT_RETURN_TO;
  try {
    const returnTo = new URL(candidate, "https://visepanda.invalid");
    if (returnTo.origin !== "https://visepanda.invalid" || returnTo.search || returnTo.hash) return DEFAULT_RETURN_TO;
    return allowedReturnTo.has(returnTo.pathname as typeof DEFAULT_RETURN_TO | "/" | "/auth/sign-in") ? returnTo.pathname as typeof DEFAULT_RETURN_TO | "/" | "/auth/sign-in" : DEFAULT_RETURN_TO;
  } catch { return DEFAULT_RETURN_TO; }
}

export function parseLocale(candidate: string | null | undefined): Locale { return candidate && locales.has(candidate as Locale) ? candidate as Locale : "zh"; }
const optional = <T extends string>(candidate: string | undefined, allowed: Set<T>): T | undefined => candidate && allowed.has(candidate as T) ? candidate as T : undefined;
const parseTripId = (candidate: string | undefined): string | undefined => candidate && UUID.test(candidate) ? candidate : undefined;

/** A caller may pass tripId only after its owning Product route validates it. */
export function createWorkspaceEntryContext(input: Readonly<{ source?: string; locale?: string | null; intent?: string; presentation?: string; scenarioId?: string; tripId?: string }>): WorkspaceEntryContextV1 {
  const intent = optional(input.intent, intents);
  const scenarioId = optional(input.scenarioId, scenarios);
  const context: WorkspaceEntryContextV1 = { version: 1, source: optional(input.source, sources) ?? "global_nav", locale: parseLocale(input.locale), presentation: optional(input.presentation, presentations) ?? "preview" };
  const tripId = parseTripId(input.tripId);
  return Object.freeze({ ...context, ...(intent ? { intent } : {}), ...(scenarioId ? { scenarioId } : {}), ...(tripId ? { tripId } : {}) });
}
