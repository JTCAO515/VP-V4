# VPJ-09 bounded relative-day outline

The native Trip screen accepts a bounded 2–7 day request naming Shanghai, Beijing, Guangzhou or Chongqing and both food and walking interests. It presents two different pacing directions. The editable day labels are local and relative; they contain no inferred venue, route, opening hour, arrival time, price or feasibility claim. Unsupported requests ask for more input instead of generating a plan.

The existing Trip patch contract accepts only calendar dates. The outline is therefore not a saved Trip or executable itinerary. After the user explicitly enters a valid start date, the native client assigns consecutive `Asia/Shanghai` dates and appends new days/items to a local draft. It rejects overlap with an existing day and preserves all existing day/item IDs and fields. The current Proposal → visible diff → exact-version confirmation → native/Web reload path remains the only write path. A rejected or stale proposal does not apply the outline.

This slice does not consume saved cross-Trip preferences or a live model, maps, knowledge, route, booking or budget source. Full VPJ-09 acceptance still requires those applicable inputs and broader Chat → Plan behavior. Evidence and remaining checks: `artifacts/VPJ-09/verification.md`.
