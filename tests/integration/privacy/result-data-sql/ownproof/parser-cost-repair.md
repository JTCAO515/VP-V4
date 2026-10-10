# Exact A+B parser cost append

Main granted only new20261008000000 and own affected proof. Old07010000 and
reference_kind/documents/parents/guard, namespaces/catalog/schema/pins/RLS/grants,
OLD/NEW images, actor/account cascade and all fences are unchanged.

Original source final-newline SHA12738f0a and actual PG prosrc parser9e014624/helper
988946e9/config/ABI/defaults/denied ACL matched before effect. The new parser's
only two body changes are the same20-key CASE extracted verbatim from helper,
and empty[] return after the original depth>32 rejection. Exact new prosrc
MD5=645393810c37120afb2514ac18706f6d and SHA256=4510c8da84fa48dda67b90c270c85dfd9e7915427bafbcad80d345d2ff61c563,
matching Main's deterministic calculation. There is no JSON scan allowlist,
iteration filter or duplicate/OLDNEW removal. All unknown nested containers,
context-sensitive references and errors remain examined.

Migration has static published prosrc/language/config/ABI/ACL-denial checks before
replace, preserving owner/config/ACL and leaving helper body unchanged afterward.
No environment hash is accepted. Initial owned rollback probe found a collation
ambiguity in composite metadata comparison; only that new append's preservation
check was corrected to individual comparisons with explicit C collation. All
subsequent compile/effect/oracle proofs pass; no old migration changed.

247 actual old/new recursively isolated parser cases compare bag WITH duplicates
and SQLSTATE/message:247 equal, including119 expected errors. Coverage is all
20 scalar/plural alias keys, kind/id/task_result/source_kind, comparisonRef and
generic resultId context, null/empty/scalar/invalid UUID/plural arrays, duplicates,
Unicode arbitrary title/UUID, unknown nested arrays/objects, and depth31/32/33
including empty arrays. ACL/config are byte-identical. Static baseline drift
checks reject altered config/helper config/ordinary grant inside rollback-only
owned fixture transactions.

Original Brief ACL/setup prerequisite and actual export bounds before/after:
2PASS0FAIL/SKIP each, original9800/5s/30s/BRIEF_LIMIT oracles untouched. Controlled
same9800 INSERT/rollback with unchanged timeout: guard706.803→489.225ms,
parser433.487→220.661ms; same39200 parser calls;196000 helper dispatches removed.
Both observed active samples have0blockers; no claim that all times/remote hosts
never wait. Current833 remote5178ms FAIL and old failures remain factual; local
PASS does not retrogreen them, and fresh integrated CI is still necessary.

Original before/after six parent sets, account cascade PASS. Affected typed/plural
notification, Brief BYTEA/malformed bytes, real writer/NOWAIT/permanent late-fence
negative3PASS0FAIL/SKIP. Current ProfileTS0702 append in owned PG transaction reports
both Profile/Result strict guards true with new645 parser and original988 helper,
then rolls back. No source or catalog hash is replaced. Unchanged source/copy/
Native/Auth/TTL matrices are reused, not rerun. Guide67 409→503 is independent
UNKNOWN and untouched. No target/role/timeout/capacity/permission action.
