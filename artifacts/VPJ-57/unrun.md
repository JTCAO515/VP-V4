# VPJ-57 remaining acceptance

- UNRUN shared Staging migration and real account employee permissions: outside this task's authorization. Runtime route remains local-only.
- UNRUN native simulator interaction tests, device/VoiceOver and screen evidence: native build passed, but Overall requested no additional simulator/browser starts during the shared heavy-work window. Build is not user-flow acceptance.
- UNRUN real employee assignment/acceptance/capacity/response-time workflow: belongs to VPJ-32. This slice stores only a request, never claims accepted.
- UNRUN dynamic Traveler Brief/Trip/profile field projection: belongs to VPJ-31. This grant covers only the saved problem text.
- UNRUN #228 export/delete handler integration and restoration drill: future handler boundary documented; this migration has owner deletion cascade and does not modify the in-flight framework.
- Existing generic suite skips: security 1 and integration 80. They are not silently counted as executed integration evidence. This ticket's dedicated real stack test was separately run with no skips.
- CI result is attached to the PR; not a production/native-device acceptance substitute. Keep #222 open pending complete acceptance.
