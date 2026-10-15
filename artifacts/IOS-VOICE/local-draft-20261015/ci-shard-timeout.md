# Required Native HTTP shard timeout

PR713 head c30d709f5fcd64b67883dabc769229cb42d9d58e: CodeReview official annotations identify job116329828303/run38707282194 as exceeding the unchanged 30 minute limit. Completed groups passed; travel-directions-auth-http was still preparing when canceled. The canceled group and aggregate failure remain FAIL/UNRUN, never PASS.

The runner had 37 logical Native HTTP steps across 8 partitions (maximum5 per job). Only partition count changes to12 (maximum4 per job); every original step, ordering within its partition, test assertion, permission boundary, fixture setup/cleanup, lane selection, no-skip rule and 30 minute timeout remain. Governance proves all37 logical steps run exactly once and rejects obsolete/malformed partitions. No excluded test, timeout increase or manual rerun.

Accepted QA707 is joined normally before this change. iOS/test source is byte-identical to reviewed fcdbbdb1 and its original build/behavior evidence remains applicable. The new exact head still needs affected governance review and all applicable CI before protected merge. This evidence is not live ASR/provider/device acceptance.
