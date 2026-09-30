# VPJ-81 remaining acceptance — 2026-09-30

| Check | State | Reason / next observation |
| --- | --- | --- |
| Shared Staging planning provider and hosted worker | UNRUN | No authenticated target run in this slice; observe accepted Task, worker progress/terminal state, and exact artifact under the enabled v5/planning flags. |
| Physical device and TestFlight | UNRUN | Simulator compilation and unit tests do not prove install, relaunch, backgrounding or foreground return on a device. |
| End-to-end user path, zh/en, large text, VoiceOver and Reduce Motion | UNRUN | Run the first direction → delegate → leave → return to result → amend path on the actual build, including focus and scroll behavior. |
| Memory correction/save/undo and result use explanation | UNRUN | #199 and the remaining #562 integration work; this slice does not claim those flows. |
| New/old conversation selection and full event replay | UNRUN | v5 currently reads the latest authorized conversation and the v2 history is capped at 20 turns; an older task outside that page stays unknown. |

Rollback: disable the planning producer flag while retaining the v5 conversation read and existing v1 cancel routes for accepted work, then revert this native consumer PR if needed. Turning off the entire v5 conversation gate would also remove this read path and needs a separate compatibility plan. Do not delete accepted tasks or artifacts.
