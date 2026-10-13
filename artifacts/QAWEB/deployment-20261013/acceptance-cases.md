# Target acceptance cases (prepared, not executed)

Run only after Main supplies the reviewed source SHA, actual valid new policy and hosted worker readiness. Pin the deployment ID/URL/commit, exact branch/env and policy notice hash before testing. Existing actors and permissions remain authoritative. Use authorized synthetic test actors and newly created test Sessions; do not inspect unrelated user conversations.

1. HTTPS and auth: open the exact preview URL and QA domain; /qa requires the existing login when signed out. Anonymous API must return its explicit authentication failure, never private Session data. Inspect actual provider notice and current consent before any provider call.
2. Login and Session: complete existing official sign-in; create a new Session; retain its real ID. Send the synthetic first message below. Observe accepted/pending, then the persisted terminal answer; a pending or technical failure is not a success.
3. Same Session continuation: send cases B–E one at a time only after the preceding terminal answer. Read each answer for actual reference to prior context/correction. Retain provider attempt/usage evidence from the authorized worker source; saved history alone does not prove model consumption.
4. Persistence: reload /qa and reopen only this test Session. Original request IDs, input order and terminal answers must survive. Poll the original request after an uncertain ACK. A replay uses the same ID and exact bytes; changed bytes must conflict. Never generate a new request as an automatic recovery.
5. Fresh Session isolation: create another new Session and send F. It must not claim knowledge of the first Session's preferences or reproduce its marker. If a second authorized actor is available, deny access to the first actor's test Session/message IDs; do not use another real user's IDs.
6. Desktop and 390×844: input, IME composition, pending/duplicate-send controls, keyboard navigation, scrolling, Session switch and reload. Switching Session/account must fence stale responses and pending state.
7. Record each result PASS/FAIL/UNRUN, elapsed time, exact source/deployment/policy/worker versions, safe test IDs and provider usage/settlement facts. Keep credentials/cookies/raw auth traces out of artifacts. No cleanup of Sessions or budget holds without the existing deletion contract/authority.

## Synthetic provider inputs

A: 这是一个使用虚构偏好的 QA 测试。我想在广州安排一个轻松下午，有 3 小时，最多步行 2 公里，偏好安静。请比较两个方案：1）慢走加咖啡休息；2）室内博物馆。只给活动类型和取舍，不编造地点、价格、开放时间，不执行预约。给出编号选项并推荐一个。

B: 为什么推荐这个？请结合我刚才的偏好解释。

C: 简化成三条要点。

D: 改用第二个选项，继续按我刚才的限制调整。

E: 更正：我现在只有 1 小时，最多步行 500 米。请更新刚才的方案。

F (fresh Session): 我刚才说有多少时间、最多走多远？如果这个会话里没有这些信息，请直接说明不知道。

This is six bounded provider submissions at most for this prepared sequence. Actual allowed budget, output bounds and attempt cap come from Main's current authorized profile/scope; do not infer them from this plan. A failed prerequisite stops dependent submissions while independent read-only diagnosis continues.
