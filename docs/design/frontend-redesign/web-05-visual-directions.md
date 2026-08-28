# WEB-05 — independent visual directions and selected baseline

Issue: [WEB-05 #139](https://github.com/JTCAO515/VP-V4/issues/139)
Decision source: direct operator instruction, 2026-08-28
Scope: frontend visual expression only; no runtime capability, data, map, provider, or release claim changes.

## Fixed product constraints

- Preserve the VisePanda capability and information relationships without using competitor DOM,
  CSS, copy, imagery, geometry, or motion as implementation input.
- Use only the approved VisePanda VI: intact logo/Guide assets, Plum/Gold/Cream/Ink tokens,
  accessible contrast, labelled controls and 44 px minimum targets.
- The primary Homepage action is `Open VisePanda` and routes to `/visepanda`.
- The China map remains disabled by default. A map is not a substitute for a Golden Route.
- Product states must remain truthful: unavailable, degraded and fixture-only behavior cannot be
  styled as live travel, booking, official, or human-help capability.

## Direction A — Golden Route Guide (selected)

The Homepage tells a short, progressive route: arrive with a clear purpose, ask one bounded
question, then carry a visible next step into the workspace. Cream provides a calm reading field;
Plum anchors navigation and evidence; Gold marks one forward action at a time. The Guide appears
as a small, explanatory companion at transitions and empty states, never as evidence or a control.

The Product Shell keeps the route language through a compact Trip Ribbon, named surfaces and
card-level state labels. It avoids a map-first canvas and avoids a fixed competitor-style composer
or sidebar geometry. Motion is limited to route reveal, proposal anchor and Guide state, all of
which become immediate changes under reduced motion.

Why selected: it directly implements the operator instruction — VisePanda VI + Golden Route +
Guide — while retaining the established map-off, `Open VisePanda` and truthful-capability rules.

## Direction B — Panda Atlas (not selected)

This direction would organize the experience around a spatial collection of place markers and
city panels, with the Guide acting as a discovery narrator. It is independently expressible with
the approved tokens, but it makes geographic orientation the dominant metaphor.

Not selected: it conflicts with the map-off default and risks treating an unapproved map or
fixture geography as an available travel capability. It remains unsuitable until a separate map
compliance decision exists.

## Direction C — Quiet Checklist (not selected)

This direction would use a restrained vertical task list, sparse colour and low-density Guide
illustrations. It emphasizes preparedness, evidence and controlled state transitions.

Not selected: it is safe and accessible but underuses the distinctive Golden Route and Guide
relationship chosen for VisePanda. It would make the shared Homepage and Product journey feel
generic rather than locally warm and orienting.

## Selection and dissent record

The direct operator choice is **Direction A — Golden Route Guide**. Direction B is rejected while
the map gate remains closed; Direction C is rejected for insufficient expression of the chosen
VisePanda character. No dissent was supplied. This decision satisfies the prior operator-selection
gate for WEB-05 without authorizing a map, unapproved brand derivative, or release cutover.

## Rollback

Revert this record and the associated queue/handoff update. No asset, runtime, user data,
external state, or product capability is created by WEB-05.
