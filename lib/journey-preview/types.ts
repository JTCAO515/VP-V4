/** Shared vocabulary for the interactive product demo. Everything here is a static fixture. */

export type Localized = { en: string; zh: string };

/** The four states from the plan, section 2.2. Reused in Canvas, Copilot, POI and User. */
export type FactState = "confirmed" | "proposed" | "inferred" | "recheck";

/** Where a claim came from. Rendered with distinct styling, plan section 10. */
export type SourceKind = "official" | "platform" | "user";

export type Confidence = "high" | "medium" | "recheck";

export type Evidence = {
  kind: SourceKind;
  label: Localized;
  /** When the demo last rechecked it. Fixed fixture text, never a live clock. */
  checked: Localized;
  validity?: Localized;
};

export type NodeKind = "sight" | "food" | "transit" | "stay" | "task";

export type CanvasNode = {
  id: string;
  time: string;
  title: Localized;
  kind: NodeKind;
  duration?: Localized;
  transfer?: Localized;
  cost?: Localized;
  state: FactState;
  confidence?: Confidence;
  evidence?: Evidence[];
  risks?: Localized[];
  /** Static handoff. Never opens a real transaction. */
  next?: { label: Localized; feedback: Localized };
  /** Position on the schematic map view, 0-1 in both axes. */
  map?: { x: number; y: number };
};

export type DaySummary = {
  walk: Localized;
  nodes: Localized;
  budget: Localized;
  indoor: Localized;
};

export type CanvasDay = {
  id: string;
  label: Localized;
  summary: DaySummary;
  stay?: Localized;
  nodes: CanvasNode[];
};

export type CompareTable = {
  caption: Localized;
  options: Localized[];
  rows: Array<{
    field: Localized;
    values: Localized[];
    /** Index of the option that matches the traveler profile, if any. */
    match?: number;
  }>;
  footnote: Localized;
};

export type DiffOp = "add" | "remove" | "move";

export type DiffEntry = {
  id: string;
  op: DiffOp;
  target: Localized;
  detail: Localized;
  reason: Localized;
  trigger: Localized;
};

export type CanvasVersion = {
  id: string;
  label: Localized;
  note: Localized;
};

export type BookingItem = {
  id: string;
  label: Localized;
  title: Localized;
  state: FactState;
  action: Localized;
  feedback: Localized;
};

export type CanvasDoc = {
  title: Localized;
  subtitle: Localized;
  days: CanvasDay[];
  compare?: CompareTable;
  versions: CanvasVersion[];
  diff?: { summary: Localized; entries: DiffEntry[] };
  bookings: BookingItem[];
  /** Shown instead of a timeline when there is no trip yet. */
  empty?: { title: Localized; body: Localized; options: Localized[] };
};

export type ChatId =
  | "new"
  | "shanghai"
  | "transport"
  | "hotel"
  | "restaurant"
  | "import"
  | "xian"
  | "family"
  | "arrival"
  | "rescue"
  | "budget";

/** One turn in a preset conversation. Plan section 4.0. */
export type Turn = {
  role: "user" | "assistant";
  text: Localized;
  /** Clarifying options the assistant offers; picking one advances to the next preset turn. */
  chips?: Localized[];
  evidence?: Evidence[];
  confidence?: Confidence;
  /** Rendered as the three-part "cannot confirm" fallback. */
  fallback?: { channel: Localized; nextStep: Localized };
  /** Quotes a long-term memory item and links back to Copilot. */
  recall?: { label: Localized; value: Localized; memoryId: string };
  /** Shows the Canvas generation skeleton under this turn. */
  generating?: boolean;
};
