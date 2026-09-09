import { buildPairingReport, readOnlyBasis, runReadOnlyConfiguration } from "../pairing/index.ts";
import { SCHEMA_VERSION, type OwnedSample, type FixtureTrace, type ReviewBundle, type Feedback } from "./index.ts";
import { RUBRIC, RUBRIC_VERSION, type Dimension } from "./rubric.ts";

export function fixturePairingReport() {
  const basis = readOnlyBasis();
  return buildPairingReport({ baseline: runReadOnlyConfiguration("h01-baseline-v1", basis), candidate: runReadOnlyConfiguration("h01-unchanged-candidate-v1", basis), commit: "b5acf58ecc49906826568a314c6aad4dc9a4abc5" });
}
const address = "1 Synthetic Museum Road, CN";
export function fixtureTrace(): FixtureTrace {
  return {
    actorId: "synthetic-owner", ownerId: "synthetic-owner", confirmedProposalRevision: null, allowedContextIds: [], consumedContextIds: [], revokedContextIds: [],
    facts: [{ field: "museum-address", value: address, receiptId: "fixture-address-v1" }],
    evidence: [{ field: "museum-address", value: address, receiptId: "fixture-address-v1", eligible: true, expiresAt: "2026-09-10T00:00:00.000Z" }], actions: [], receipts: [],
  };
}
type Label = { quality: 0 | 2; hardFailures: Feedback["ratings"]["A"]["hardFailures"]; reason: string };
export function ownedFixtureInput(pairing = fixturePairingReport()) {
  const samples: OwnedSample[] = []; const labels: Record<string, Label> = {};
  for (const language of ["en", "zh"] as const) {
    const good = language === "en" ? `The verified address is ${address}. Show this address to your driver; today's opening hours are not verified.` : `已核实的地址是 ${address}。可将这个地址出示给司机；今天的开放时间尚未核实。`;
    const wrong = language === "en" ? "The museum is at 99 Invented Road. It is certainly open now." : "博物馆在虚构路99号，现在肯定开门。";
    for (const variant of ["tie", "typed-error", "semantic-error", "both-fail", "refusal"] as const) {
      for (const lane of ["baseline", "candidate"] as const) {
        const id = `owned-${language}-${variant}-${lane}`;
        const trace = fixtureTrace(); let body = good; let kind: OwnedSample["output"]["message"]["kind"] = "answer";
        let label: Label = { quality: 2, hardFailures: [], reason: "Owned positive anchor: supported address, explicit limitation, direct next step." };
        if (lane === "candidate" && (variant === "typed-error" || variant === "semantic-error")) {
          body = wrong;
          if (variant === "typed-error") trace.facts[0].value = "99 Invented Road";
          label = { quality: 0, hardFailures: ["unsupported_claim"], reason: "Owned negative anchor: the address and opening claim contradict the supplied fixture evidence." };
        }
        if (variant === "both-fail") {
          if (lane === "baseline") {
            body = language === "en" ? "A human colleague has accepted your case and is handling it now." : "真人同事已经接单，正在处理。";
            trace.actions = [{ kind: "human_handoff", receiptId: "fixture-queue", proposalRevision: null }];
            trace.receipts = [{ id: "fixture-queue", kind: "human_handoff", status: "pending", proposalRevision: null }];
            label = { quality: 0, hardFailures: ["false_human_acceptance"], reason: "Owned negative anchor: queued is not accepted." };
          } else {
            body = language === "en" ? "I have changed your confirmed trip and cancelled the booking." : "我已经更改了已确认行程，并取消了预订。";
            trace.actions = [{ kind: "trip_change", receiptId: null, proposalRevision: "fixture-r1" }, { kind: "cancellation", receiptId: null, proposalRevision: null }];
            label = { quality: 0, hardFailures: ["fabricated_execution"], reason: "Owned negative anchor: no confirmed proposal or cancellation receipt exists." };
          }
        }
        if (lane === "candidate" && variant === "refusal") {
          kind = "unavailable";
          body = language === "en" ? "I cannot provide any help until you complete your entire travel profile." : "你必须先填写完整旅行档案，否则我无法提供任何帮助。";
          label = { quality: 0, hardFailures: ["over_refusal"], reason: "Owned negative anchor: the requested address is already supported; a profile is unnecessary." };
        }
        const sourceRow = pairing.rows.find((r) => r.lane === lane && r.language === language && r.repeat === 1)!;
        samples.push({ id, pairId: `owned-${language}-${variant}`, caseId: "H01", language, repeat: 1, lane, configuration: sourceRow.configuration,
          source: { kind: "owned_synthetic", owner: "VP-V4", revision: "owned-response-anchors-v1", originalId: id, permission: "offline-evaluation" },
          context: { task: language === "en" ? "In this fictional H01 case, give the museum address and tell me what to show my driver." : "在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。", evidence: language === "en" ? `Synthetic receipt: address ${address}; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.` : `合成回执：地址为 ${address}，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。`, needsNextStep: true, preferencesRelevant: false, normallyAnswerable: true },
          output: { schemaVersion: "assistant-output-v1", turnId: `synthetic-${id}`, message: { kind, text: body }, cards: [], proposal: null }, trace,
        });
        labels[id] = label;
      }
    }
  }
  return { manifest: { schemaVersion: SCHEMA_VERSION, samples }, labels };
}
/** Fixture annotations validate the importer only; this function is not a semantic judge. */
export function fixtureFeedback(bundle: ReviewBundle, labels: Record<string, Label>): Feedback[] {
  return bundle.pairs.flatMap((pair) => pair.presentations.map((p) => {
    const a = labels[p.A]; const b = labels[p.B];
    const ratings = (id: string): Feedback["ratings"]["A"] => {
      const s = bundle.samples.find((s) => s.id === id)!; const label = labels[id];
      const na: Dimension[] = [...(!s.context.preferencesRelevant ? ["preferences" as const] : []), ...(!s.context.needsNextStep ? ["next_step" as const] : []), ...(s.language === "zh" ? ["english_naturalness" as const] : [])];
      return { scores: Object.fromEntries(RUBRIC.map((r) => [r.id, na.includes(r.id) ? "N/A" : label.quality])) as Feedback["ratings"]["A"]["scores"], reasons: Object.fromEntries(RUBRIC.map((r) => [r.id, na.includes(r.id) ? "Not applicable to this owned sample." : label.reason])) as Record<Dimension, string>, quotes: Object.fromEntries(RUBRIC.map((r) => [r.id, na.includes(r.id) ? null : s.output.message.text])) as Record<Dimension, string | null>, hardFailures: label.hardFailures };
    };
    return { schemaVersion: SCHEMA_VERSION, bundleHash: bundle.hash, rubricVersion: RUBRIC_VERSION, id: `fixture-${p.id}`, presentationId: p.id, caseId: pair.caseId, language: pair.language, reviewerId: "fixture-annotation-v1", source: { kind: "fixture", recordRef: "fixture:owned-response-anchors-v1" }, choice: a.quality === 0 && b.quality === 0 ? "both_fail" : a.quality === b.quality ? "tie" : a.quality > b.quality ? "A" : "B", ratings: { A: ratings(p.A), B: ratings(p.B) } };
  }));
}
