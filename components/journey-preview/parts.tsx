import type { Lang } from "@/lib/journey-preview/copy";
import type { Confidence, Evidence, FactState } from "@/lib/journey-preview/types";
import { CONFIDENCE_LABEL, SOURCE_LABEL, STATE_LABEL } from "@/lib/journey-preview/ui";

/** Confirmed / Proposed / Inferred / Recheck. One component, reused everywhere. */
export function StateBadge({ state, lang }: { state: FactState; lang: Lang }) {
  return <span className={`vp-state vp-state-${state}`}>{STATE_LABEL[state][lang]}</span>;
}

export function ConfidenceTag({ level, lang }: { level: Confidence; lang: Lang }) {
  return <span className={`vp-conf vp-conf-${level}`}>{CONFIDENCE_LABEL[level][lang]}</span>;
}

/** Source + recheck time. Never rendered without both. */
export function EvidenceChip({ item, lang }: { item: Evidence; lang: Lang }) {
  return (
    <span className={`vp-evidence vp-evidence-${item.kind}`}>
      <b>{SOURCE_LABEL[item.kind][lang]}</b>
      {item.label[lang]}
      <i>{item.checked[lang]}</i>
      {item.validity ? <em>{item.validity[lang]}</em> : null}
    </span>
  );
}

export function EvidenceRow({ items, lang }: { items?: Evidence[]; lang: Lang }) {
  if (!items?.length) return null;
  return <div className="vp-evidence-row">{items.map((item, index) => <EvidenceChip key={index} item={item} lang={lang} />)}</div>;
}
