# S3 milestone #9 dependency snapshot — 2026-09-18

GitHub milestone `VPJ S3 · 共同计划与明确确认`: 15 open, 1 closed at inspection. The order below follows usable inputs first, then integration dependencies; it is not a claim that an open parent is accepted. Main was `2370391f` at selection.

| Order | Open Issue | Practical prerequisite at selection |
| ---: | --- | --- |
| 1 | [#208 VPJ-18](https://github.com/JTCAO515/VP-V4/issues/208) | #190 and four-city provider comparison #362 closed; parent acceptance remains open. |
| 2 | [#197 VPJ-09](https://github.com/JTCAO515/VP-V4/issues/197) | #192 closed and main has actual Trip create/proposal/confirm/readback; #195/#196 remain open for complete Ask/recovery acceptance. Selected bounded slice. |
| 3 | [#199 VPJ-11](https://github.com/JTCAO515/VP-V4/issues/199) | #190/#192 closed; #195 remains open for final consumer chain. |
| 4 | [#363 VPJ-19 place slice](https://github.com/JTCAO515/VP-V4/issues/363) | #362 closed; place consumer work remains open. |
| 5 | [#209 VPJ-19](https://github.com/JTCAO515/VP-V4/issues/209) | #192 closed; #208 and place/route slices remain open. |
| 6 | [#198 VPJ-10](https://github.com/JTCAO515/VP-V4/issues/198) | Needs #197's actual initial-plan consumer, still open; can prepare a bounded local edit only. |
| 7 | [#364 VPJ-19 route slice](https://github.com/JTCAO515/VP-V4/issues/364) | Needs selected place identity from #363 in the route consumer. |
| 8 | [#219 VPJ-65](https://github.com/JTCAO515/VP-V4/issues/219) | Actual #197 plan, #206 knowledge, and #209 place/route consumers are incomplete. No feasible-plan claim yet. |
| 9 | [#210 VPJ-20](https://github.com/JTCAO515/VP-V4/issues/210) | Needs #197, #205 and #209 for full Save/Ask/Add. |
| 10 | [#211 VPJ-21](https://github.com/JTCAO515/VP-V4/issues/211) | #358 closed; #198, #206 and #209 remain incomplete. |
| 11 | [#367 VPJ-18 Tencent slice](https://github.com/JTCAO515/VP-V4/issues/367) | Conditional fallback needs a real #364 route and demonstrated benefit. |
| 12 | [#365 VPJ-20 trip/map slice](https://github.com/JTCAO515/VP-V4/issues/365) | Needs #364 route and #210 consumer chain. |
| 13 | [#265 VPJ-68](https://github.com/JTCAO515/VP-V4/issues/265) | Hard #219 dependency plus #198/#199/#264 for measured retained-dinner edit. |
| 14 | [#266 VPJ-69](https://github.com/JTCAO515/VP-V4/issues/266) | Hard #265 dependency; real durable task fault chain absent. |
| 15 | [#207 VPJ-17](https://github.com/JTCAO515/VP-V4/issues/207) | Hard #359 dependency belongs to its existing thread; #206 remains incomplete. |

Native GitHub `blockedBy` and ordinary final acceptance associations are different. Several rows have no hard opening dependency, but their full consumer behavior is not ready. The protected #359 and other assigned tickets were not modified. The milestone remains open until each complete Issue has real evidence.
