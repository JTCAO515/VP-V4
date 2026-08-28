const LOCALES = ["zh", "en", "es", "ru", "ar"] as const;
const FIELD_KINDS = ["menu", "address", "money", "station", "ticket"] as const;
type Locale = (typeof LOCALES)[number];
type FieldKind = (typeof FIELD_KINDS)[number];
type Field = Readonly<{ id: FieldKind; kind: FieldKind; confidence: number | null; translation: string | null; geometry: Readonly<{ x: number; y: number; width: number; height: number }> }>;
type Fixture = Readonly<{ id: string; sourceLocale: Locale; targetLocale: "en"; revision: 1; fields: readonly Field[] }>;
const FIXTURES: ReadonlyMap<string, Fixture> = new Map(LOCALES.map((sourceLocale, localeIndex) => {
  const fields = FIELD_KINDS.map((kind, kindIndex) => Object.freeze({ id: kind, kind, confidence: kind === "menu" && sourceLocale === "zh" ? null : 1, translation: kind === "menu" && sourceLocale === "zh" ? null : `synthetic-${sourceLocale}-${kind}`, geometry: Object.freeze({ x: kindIndex, y: localeIndex, width: 1, height: 1 }) }));
  return [`fixture-${sourceLocale}`, Object.freeze({ id: `fixture-${sourceLocale}`, sourceLocale, targetLocale: "en" as const, revision: 1 as const, fields: Object.freeze(fields) })];
}));
type Unavailable = Readonly<{ kind: "translation_unavailable" }>;
export type FixtureTranslation = Readonly<{ kind: "fixture_translation"; documentId: string; revision: 1; sourceLocale: Locale; targetLocale: "en"; fields: readonly Readonly<{ id: FieldKind; kind: FieldKind; state: "translated" | "missing"; translation: string | null; geometry: Field["geometry"] }>[] }> | Unavailable;
export function translateFixtureDocument(input: unknown): FixtureTranslation {
  if (!isExactRecord(input, ["fixtureId"]) || typeof input.fixtureId !== "string") return unavailable();
  const fixture = FIXTURES.get(input.fixtureId);
  if (!fixture) return unavailable();
  return freeze({ kind: "fixture_translation" as const, documentId: fixture.id, revision: 1 as const, sourceLocale: fixture.sourceLocale, targetLocale: "en" as const, fields: freeze(fixture.fields.map((field) => freeze({ id: field.id, kind: field.kind, state: field.confidence === null ? "missing" as const : "translated" as const, translation: field.confidence === null ? null : field.translation, geometry: field.geometry }))) });
}
export type CorrectionResult = Readonly<{ kind: "corrected_revision"; documentId: string; revision: 2; fieldId: FieldKind; text: "synthetic_correction"; mtState: "superseded"; ttsState: "superseded" }> | Unavailable;
export function applyFixtureCorrection(input: unknown): CorrectionResult {
  if (!isExactRecord(input, ["fixtureId", "fieldId", "correctionCode", "revisionId"]) || typeof input.fixtureId !== "string" || typeof input.fieldId !== "string" || typeof input.revisionId !== "string" || input.correctionCode !== "synthetic_correction" || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(input.revisionId)) return unavailable();
  const fixture = FIXTURES.get(input.fixtureId);
  if (!fixture || !FIELD_KINDS.includes(input.fieldId as FieldKind)) return unavailable();
  return freeze({ kind: "corrected_revision" as const, documentId: fixture.id, revision: 2 as const, fieldId: input.fieldId as FieldKind, text: "synthetic_correction" as const, mtState: "superseded" as const, ttsState: "superseded" as const });
}
function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function unavailable(): Unavailable { return freeze({ kind: "translation_unavailable" as const }); }
function freeze<T>(value: T): Readonly<T> { return Object.freeze(value); }
