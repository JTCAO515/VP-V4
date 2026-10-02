# Main review correction: SQLNULL digest fail-closed

2026-10-03. Original e039e357 validcases did not cover JSONnull digest. Main found validate_planning_v2_output_v1 could return SQLNULL; IF NOT(NULL) skipped refusal in both write function and trigger. Original full-checkpoint evidence remains bound to e039 source, never a claim these negative cases passed.

Correction: digest JSONtypes must be strings, values64lowerhex; final comparison coalesce(...,false). Both response gate and trigger require validator IS NOT DISTINCT FROM true (reject with IS DISTINCT FROM true). No grant/ledger/worker/completion change.

PASS targeted actualPG2/2,0skip6534ms: original fixed9c9 validwire/hash parity remainstrue; outputDigestnull/usagenull/bothnull/number/array/boolean/object return strictly f (notNULL), normal response write blocked, direct table trigger INVALID_LOCAL_OUTPUT. Entire row (phase/revision/output/etc) and ledger bytes remain unchanged, then original valid vector records correctly. No unrelated fullmatrix rerun.

Separate required cascade/immutability check PASS1/1,0skip at earlier e039 SQL source: no identity/phase reset, owner/Task/planningTurn/attempt cascade FKs, actual turn deletion removes only selected journal while preserving another owner and financial ledger. This unrelated source-bound proof is retained, not falsely attributed as the null-fix test. Actual account deletion/old Task cleanup executor remains UNRUN.

Same full actualcheckout migrations andowned networknonePG fixtures; no provider/origin/paidpermission. Syntax/diffPASS. Main independentreview/consumer jointjournal/formalCI pending; all19/20 fields and falseflags unchanged.

SQL SHA256: 6120eafe95fc529cfbc95050038e727d1bde82145f64dbbdec2923d07fd80563
