import { createElement, type ReactElement } from "react";

import { executionCardCopy, type Locale } from "../../../lib/i18n.ts";
import type { GroundedExecutionOutcomeV1 } from "../../../lib/server/knowledge/claim/grounded-execution.ts";

export function GroundedExecutionCard(props: Readonly<{
  locale: Locale;
  outcome: Extract<GroundedExecutionOutcomeV1, { kind: "execution_card" }>;
}>): ReactElement {
  const copy = executionCardCopy[props.locale];
  return createElement(
    "section",
    { "data-grounded-execution-card": "true", "aria-label": copy.heading },
    createElement("h2", null, copy.heading),
    createElement(
      "ul",
      null,
      props.outcome.rows.map((row) =>
        createElement(
          "li",
          { key: `${row.claim.claimType}:${row.claim.subjectId}`, "data-claim-type": row.claim.claimType },
          createElement("h3", null, copy.claimTypes[row.claim.claimType]),
          createElement("p", null, row.value),
          row.qualifiers.length === 0
            ? null
            : createElement("ul", null, row.qualifiers.map((qualifier) => createElement("li", { key: qualifier.code }, copy.qualifiers[qualifier.code]))),
        ),
      ),
    ),
  );
}
