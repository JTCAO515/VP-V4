export const CONTEXT_PLAN_VERSION = "context-plan-v1";
export const CONTEXT_COMPACTION_VERSION = "context-compaction-v1";

export const CONTEXT_SECTION_ORDER = [
  "system",
  "policy",
  "constraints",
  "trip",
  "proposal",
  "memory",
  "evidence",
  "tool",
  "thread",
  "user_message",
] as const;

export type ContextSection = (typeof CONTEXT_SECTION_ORDER)[number];
export type ContextSourceKind = ContextSection | "user_artifact";
export type TaskProfileId = "trip_planning" | "trip_update" | "information_lookup" | "recovery";
export type RiskClass = "low" | "elevated" | "high";

export type ContextPolicy = Readonly<{
  taskProfile: TaskProfileId;
  riskClass: RiskClass;
  allowedSources: readonly ContextSourceKind[];
  requiredSources: readonly ContextSourceKind[];
  tokenBudgets: Readonly<Record<ContextSection, number>>;
  maxToolDefinitions: number;
  maxEvidenceItems: number;
  includeRawUserArtifact: false;
  compactionVersion: typeof CONTEXT_COMPACTION_VERSION;
}>;

export type ContextPlan = Readonly<{
  contextVersion: typeof CONTEXT_PLAN_VERSION;
  policy: ContextPolicy;
  sectionOrder: readonly ContextSection[];
}>;

export type ContextPlanInput = Readonly<{ taskProfile: TaskProfileId; riskClass: RiskClass }>;

export class ContextPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextPlanError";
  }
}

const ALL_MODEL_SAFE_SOURCES: readonly ContextSourceKind[] = [
  "system",
  "policy",
  "constraints",
  "trip",
  "proposal",
  "memory",
  "evidence",
  "tool",
  "thread",
  "user_message",
];

const REQUIRED_SOURCES: readonly ContextSourceKind[] = ["system", "policy", "constraints", "user_message"];

const TOKEN_BUDGETS: Readonly<Record<ContextSection, number>> = {
  system: 120,
  policy: 120,
  constraints: 200,
  trip: 180,
  proposal: 120,
  memory: 160,
  evidence: 160,
  tool: 100,
  thread: 100,
  user_message: 160,
};

const TASK_ALLOWED_SOURCES: Readonly<Record<TaskProfileId, readonly ContextSourceKind[]>> = {
  trip_planning: ALL_MODEL_SAFE_SOURCES,
  trip_update: ALL_MODEL_SAFE_SOURCES,
  information_lookup: ["system", "policy", "constraints", "evidence", "tool", "thread", "user_message"],
  recovery: ["system", "policy", "constraints", "trip", "proposal", "evidence", "thread", "user_message"],
};

export function createContextPlan(input: ContextPlanInput): Readonly<ContextPlan> {
  assertTaskProfile(input.taskProfile);
  assertRiskClass(input.riskClass);

  const allowedSources = input.riskClass === "high"
    ? TASK_ALLOWED_SOURCES[input.taskProfile].filter((source) => source !== "tool")
    : TASK_ALLOWED_SOURCES[input.taskProfile];

  return deepFreeze({
    contextVersion: CONTEXT_PLAN_VERSION,
    sectionOrder: [...CONTEXT_SECTION_ORDER],
    policy: {
      taskProfile: input.taskProfile,
      riskClass: input.riskClass,
      allowedSources: [...allowedSources],
      requiredSources: [...REQUIRED_SOURCES],
      tokenBudgets: { ...TOKEN_BUDGETS },
      maxToolDefinitions: input.riskClass === "high" ? 0 : input.riskClass === "elevated" ? 2 : 4,
      maxEvidenceItems: input.riskClass === "high" ? 4 : 6,
      includeRawUserArtifact: false,
      compactionVersion: CONTEXT_COMPACTION_VERSION,
    },
  });
}

function assertTaskProfile(value: string): asserts value is TaskProfileId {
  if (!(value in TASK_ALLOWED_SOURCES)) throw new ContextPlanError(`Unknown task profile: ${value}`);
}

function assertRiskClass(value: string): asserts value is RiskClass {
  if (value !== "low" && value !== "elevated" && value !== "high") throw new ContextPlanError(`Unknown risk class: ${value}`);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
