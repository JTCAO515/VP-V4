# VPJ-66/VPJ-67 离线运行摘要

准备判定：PASS。模式：fixture；语言：en。

12个独立案例：正常种子3次（H01/H02 归 VPJ-66，H04 归 VPJ-67），故障注入5次；其余9例NOT_RUN。真实Staging 0次，12例全部NOT_RUN。

- H01: PASS; completed; answered; VPJ-67
- H02: PASS; completed; answered; VPJ-68
- H03: NOT_RUN; not_started; unknown; VPJ-67
- H04: PASS; completed; blocked; VPJ-67
- H05: NOT_RUN; not_started; unknown; VPJ-68
- H06: NOT_RUN; not_started; unknown; VPJ-68
- H07: NOT_RUN; not_started; unknown; VPJ-67
- H08: NOT_RUN; not_started; unknown; VPJ-67
- H09: NOT_RUN; not_started; unknown; VPJ-69
- H10: NOT_RUN; not_started; unknown; VPJ-69
- H11: NOT_RUN; not_started; unknown; VPJ-68
- H12: NOT_RUN; not_started; unknown; VPJ-67

故障预期FAIL：H01-unsupported=FAIL (grounding/CLAIM_SUPPORTED_BY_ORACLE)；H01-refusal=FAIL (answer/REQUIRED_CLAIM_PRESENT)；H02-dinner=FAIL (candidate/DINNER_LOCK_PRESERVED)；H02-unconfirmed=FAIL (confirmation/NO_UNCONFIRMED_WRITE)；H04-single-candidate-assumed=FAIL (answer/NO_SINGLE_SUBJECT_SELECTED)。

费用与usage未知；不声称真实步行、身份、确认或持久化验收。详情见 results.json、docs/harness/OFFLINE-SEEDS.md 与 docs/harness/VPJ-67-READONLY-SEEDS.md。
