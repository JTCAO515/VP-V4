# #360 real Web Preview policy/read baseline — 2026-09-19

Target: Vercel Preview `dpl_CZoHE82rGyxPQ7NFe8mcBeWYEJPU`, generated host
`https://vp-v4-5dcdig8mo-jtcao515s-projects.vercel.app`, built from
`fea2eb03ec817847f1a3ff47379f5906581b3def` with branch-scoped
grounded Ask configuration. The existing firewall deny rule at active
version 105 added only this exact host; a historical Preview host remained
blocked with `403 x-vercel-mitigated: deny`.

Anonymous `/api/chat/grounded` and `/api/chat/native/v4/policy` requests
returned application `401`, proving that the configured routes were reached
through the firewall without exposing policy/history to an anonymous caller.
The owned author logged into this deployed Web host through the real sign-in
page. Before the native policy consent, the “已保存的回答” region showed an
unavailable state. After the same account accepted the current Qwen policy
inside the installed iOS app, Web refresh rendered the authorized empty
history (“暂无可读取的已保存回答”).

[Web viewport after native consent](after-native-consent-empty-history.png)
is the actual deployed page. This is policy and empty-history readback only:
there is no Web Ask answer, EvidencePack, publication comparison or rollback
claim yet. Original Trip rows were not modified during this step.

## Cross-surface read of the first real native turn

After the installed iOS app submitted turn
`8db8c8e3-debd-42d1-a8e0-acfe1d4426f9` and the dedicated real Qwen
worker settled it as `clarification`, the same signed-in ordinary owner
opened this deployed Web page. The saved-answer region now displayed the
exact original question, Shanghai scope, Chinese locale, and an honest
“还需要更多信息” notice. [Real Web viewport](ios-turn-clarification-readback.png).
This demonstrates owner Web readback of a real native-submitted turn, but
not a successful fact answer or EvidencePack; it does not satisfy #360's
published-Wiki consumption criterion.

## Live owner/other-user read boundary

The two owned ordinary Staging accounts separately authenticated through
real GoTrue password login and called the same real PostgREST policy/history
RPCs. The author saw current policy `accepted` and exactly one own grounded
turn containing the sent question. The other member saw `not_accepted` and
an empty grounded history; the author's question was absent. This is a
real remote owner-isolation observation for the policy/history read path,
not a replacement for post-publication and revoked-source isolation tests.

## Real answered rail turn in deployed Web

The signed-in owner reopened the actual Preview after the third native turn
settled. Web rendered the exact native input, two factual statements, four
conditions and one exclusion per statement. The operator expanded both
source disclosures and observed China Railway 12306's Q2 e-ticket locator
and Q11 itinerary/reimbursement-receipt locator with the official HTTPS
link. [Real Web answer viewport](rail-answer-existing-facts.png).

This is actual cross-surface readback of the App's **existing** reviewed
facts; it is not yet a new #359 publication or an agentic EvidencePack.

## Real AI-assist timeout defect, before repair

The fourth native Ask turn `0691deb1-fcfe-4d0f-997f-80f8a4d3b8b8` asked
about overseas-card merchant acceptance in Shanghai. Its real Qwen worker
settled `payment_card_acceptance/single` as `blocked` because the existing
payment source is revoked. The same owner then invoked the offered AI deep
search from this deployed Web page. The actual POST returned application
`503`; the UI showed “AI 搜索暂时不可用”, and the private assist job remained
`running` with no stored outcome at the time of inspection. This is a
**FAIL**, not an EvidencePack. The route's 10-second request scope was
shorter than its own four allowed 15-second provider rounds, and the Web
client aborted after 20 seconds. A bounded timeout repair was prepared;
new-deployment readback is still required before changing this result.
