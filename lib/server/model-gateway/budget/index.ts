type Config = Readonly<{ windowMs: number; perUserAttempts: number; perTaskAttempts: number; turnDeadlineMs: number; maxModelSteps: number; maxToolSteps: number }>;
type Decision = Readonly<{ kind: "admitted" }> | Readonly<{ kind: "unavailable"; code: "BUDGET_EXHAUSTED" | "TIMEOUT_BEFORE_OUTPUT"; metricLabel: "budget_exhausted" | "timeout_before_output" }> | Readonly<{ kind: "invalid" }>;
type Turn = Readonly<{ kind: "turn"; admitModelStep: () => Decision; admitToolStep: () => Decision }>;
type Start = Turn | Readonly<{ kind: "invalid" }>;

const CONFIG_KEYS = ["windowMs", "perUserAttempts", "perTaskAttempts", "turnDeadlineMs", "maxModelSteps", "maxToolSteps"] as const;
const TURN_KEYS = ["userId", "taskId"] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** C0 guard owns time and step state; callers can request a step but cannot declare its metadata. */
export class CostGuard {
  readonly #config: Config;
  readonly #clock: () => number;
  readonly #users = new Map<string, number[]>();
  readonly #tasks = new Map<string, Map<string, number[]>>();
  #lastNow = -1;

  constructor(config: Config, clock: () => number = Date.now) {
    if (!isConfig(config) || typeof clock !== "function") throw new TypeError("Invalid cost guard configuration.");
    this.#config = Object.freeze({ ...config });
    this.#clock = clock;
  }

  startTurn(value: unknown): Start {
    if (!isTurnRequest(value)) return invalid();
    const startedAt = this.#now();
    if (startedAt === null) return invalid();
    let modelSteps = 0;
    let toolSteps = 0;
    return Object.freeze({
      kind: "turn",
      admitModelStep: () => this.#admit(value.userId, value.taskId, startedAt, "model", () => modelSteps, () => { modelSteps += 1; }),
      admitToolStep: () => this.#admit(value.userId, value.taskId, startedAt, "tool", () => toolSteps, () => { toolSteps += 1; }),
    });
  }

  #admit(userId: string, taskId: string, startedAt: number, kind: "model" | "tool", count: () => number, increment: () => void): Decision {
    const now = this.#now();
    if (now === null) return invalid();
    if (now - startedAt >= this.#config.turnDeadlineMs) return timeout();
    const limit = kind === "model" ? this.#config.maxModelSteps : this.#config.maxToolSteps;
    if (count() >= limit) return exhausted();
    const user = this.#active(this.#users.get(userId), now);
    const taskMap = this.#tasks.get(userId) ?? new Map<string, number[]>();
    const task = this.#active(taskMap.get(taskId), now);
    if (user.length >= this.#config.perUserAttempts || task.length >= this.#config.perTaskAttempts) return exhausted();
    increment(); user.push(now); task.push(now); this.#users.set(userId, user); taskMap.set(taskId, task); this.#tasks.set(userId, taskMap);
    return Object.freeze({ kind: "admitted" });
  }

  #now(): number | null {
    const value = this.#clock();
    if (!Number.isSafeInteger(value) || value < 0 || value < this.#lastNow) return null;
    this.#lastNow = value;
    return value;
  }
  #active(values: readonly number[] | undefined, now: number): number[] { return (values ?? []).filter((value) => value > now - this.#config.windowMs && value <= now); }
}

function isConfig(value: unknown): value is Config { return isRecord(value) && exact(value, CONFIG_KEYS) && CONFIG_KEYS.every((key) => positive(value[key])); }
function isTurnRequest(value: unknown): value is Readonly<{ userId: string; taskId: string }> { return isRecord(value) && exact(value, TURN_KEYS) && typeof value.userId === "string" && ID.test(value.userId) && typeof value.taskId === "string" && ID.test(value.taskId); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function positive(value: unknown): boolean { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function exhausted(): Decision { return Object.freeze({ kind: "unavailable", code: "BUDGET_EXHAUSTED", metricLabel: "budget_exhausted" }); }
function timeout(): Decision { return Object.freeze({ kind: "unavailable", code: "TIMEOUT_BEFORE_OUTPUT", metricLabel: "timeout_before_output" }); }
function invalid(): Readonly<{ kind: "invalid" }> { return Object.freeze({ kind: "invalid" }); }
