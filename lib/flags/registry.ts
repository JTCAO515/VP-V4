export const FLAGS = {
  TRIP_PERSISTENCE_ENABLED: {
    owner: "TripWorkspace / AI-10",
    default: false,
    dependsOn: [],
    killSwitchResult: "Trip persistence is unavailable before any Trip write.",
    observation: "The flag decision returns flag_disabled for Trip persistence.",
    deleteBy: "2026-12-31",
  },
  CHAT_RUNTIME_ENABLED: {
    owner: "TurnCoordinator / AI-12",
    default: false,
    dependsOn: ["TRIP_PERSISTENCE_ENABLED"],
    killSwitchResult: "Chat runtime is unavailable before a Turn starts.",
    observation: "The flag decision returns flag_disabled for Chat runtime.",
    deleteBy: "2026-12-31",
  },
} as const;

export type FlagName = keyof typeof FLAGS;
export type FlagState = Readonly<Record<FlagName, boolean>>;

export type FlagDecision =
  | Readonly<{ available: true; reason: "enabled" }>
  | Readonly<{ available: false; reason: "flag_disabled" }>;

export const defaultFlags: FlagState = Object.fromEntries(
  Object.entries(FLAGS).map(([name, definition]) => [name, definition.default]),
) as FlagState;

export function decideFlag(state: FlagState, name: FlagName): FlagDecision {
  return state[name]
    ? { available: true, reason: "enabled" }
    : { available: false, reason: "flag_disabled" };
}

export function invalidFlags(state: FlagState): readonly string[] {
  return Object.entries(FLAGS).flatMap(([name, definition]) =>
    state[name as FlagName] &&
    definition.dependsOn.some((dependency) => !state[dependency as FlagName])
      ? [`${name} requires ${definition.dependsOn.join(",")}`]
      : [],
  );
}

export function invalidRegistry(): readonly string[] {
  const errors: string[] = [];
  const names = new Set<FlagName>(Object.keys(FLAGS) as FlagName[]);

  for (const [name, definition] of Object.entries(FLAGS)) {
    if (definition.owner.trim() === "") errors.push(`${name} has no owner`);
    if (definition.killSwitchResult.trim() === "") errors.push(`${name} has no kill-switch result`);
    if (definition.observation.trim() === "") errors.push(`${name} has no observation`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(definition.deleteBy) ||
      Number.isNaN(Date.parse(`${definition.deleteBy}T00:00:00Z`))
    ) {
      errors.push(`${name} has an invalid deletion date`);
    }

    for (const dependency of definition.dependsOn) {
      if (!names.has(dependency as FlagName)) errors.push(`${name} has unknown dependency ${dependency}`);
      if (dependency === name) errors.push(`${name} depends on itself`);
    }
  }

  errors.push(...invalidFlags(defaultFlags).map((error) => `default state: ${error}`));
  return errors;
}
