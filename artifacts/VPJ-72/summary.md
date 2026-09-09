# VP response-quality observations

Schema: vp-response-quality-v1; rubric: vp-response-rubric-v1; bundle: b8c163e2daf68133d6cbc333668cd8ae79d1ae73fa70973290736139083e1997

Samples 20; failures 10; semantics NOT_RUN 0; fixture feedback 20; human-declared feedback 0.
Canonical suite remains 12 cases / 8 development / 4 holdout. Variants do not increase independent case count. Real provider pairing, human calibration and adoption: UNRUN.

- en: 10 samples, 5 failed, 0 semantic NOT_RUN, 10 with unreviewed human dimensions.
- zh: 10 samples, 5 failed, 0 semantic NOT_RUN, 10 with unreviewed human dimensions.

| Sample | Language | Lane | Parent verdict | Deterministic | Semantic observations | Result |
| --- | --- | --- | --- | --- | --- | --- |
| owned-en-tie-baseline | en | baseline | PASS | PASS | fixture_annotations_only | evidence_insufficient |
| owned-en-tie-candidate | en | candidate | PASS | PASS | fixture_annotations_only | evidence_insufficient |
| owned-en-typed-error-baseline | en | baseline | PASS | PASS | fixture_annotations_only | evidence_insufficient |
| owned-en-typed-error-candidate | en | candidate | PASS | FAIL | fixture_annotations_only | FAIL |
| owned-en-semantic-error-baseline | en | baseline | PASS | PASS | fixture_annotations_only | evidence_insufficient |
| owned-en-semantic-error-candidate | en | candidate | PASS | PASS | fixture_annotations_only | FAIL |
| owned-en-both-fail-baseline | en | baseline | PASS | FAIL | fixture_annotations_only | FAIL |
| owned-en-both-fail-candidate | en | candidate | PASS | FAIL | fixture_annotations_only | FAIL |
| owned-en-refusal-baseline | en | baseline | PASS | PASS | fixture_annotations_only | evidence_insufficient |
| owned-en-refusal-candidate | en | candidate | PASS | FAIL | fixture_annotations_only | FAIL |
| owned-zh-tie-baseline | zh | baseline | NOT_RUN | PASS | fixture_annotations_only | evidence_insufficient |
| owned-zh-tie-candidate | zh | candidate | NOT_RUN | PASS | fixture_annotations_only | evidence_insufficient |
| owned-zh-typed-error-baseline | zh | baseline | NOT_RUN | PASS | fixture_annotations_only | evidence_insufficient |
| owned-zh-typed-error-candidate | zh | candidate | NOT_RUN | FAIL | fixture_annotations_only | FAIL |
| owned-zh-semantic-error-baseline | zh | baseline | NOT_RUN | PASS | fixture_annotations_only | evidence_insufficient |
| owned-zh-semantic-error-candidate | zh | candidate | NOT_RUN | PASS | fixture_annotations_only | FAIL |
| owned-zh-both-fail-baseline | zh | baseline | NOT_RUN | FAIL | fixture_annotations_only | FAIL |
| owned-zh-both-fail-candidate | zh | candidate | NOT_RUN | FAIL | fixture_annotations_only | FAIL |
| owned-zh-refusal-baseline | zh | baseline | NOT_RUN | PASS | fixture_annotations_only | evidence_insufficient |
| owned-zh-refusal-candidate | zh | candidate | NOT_RUN | FAIL | fixture_annotations_only | FAIL |

- a3cf484611100f97f2233ecb: evidence_insufficient; preference tie; votes 2; complete order checks 1; order disagreements 0.
- bcadebf9fd4e7a17aaed3988: reject_candidate; preference owned-en-typed-error-baseline; votes 2; complete order checks 1; order disagreements 0.
- d10d5138ee96fa72518521b2: reject_candidate; preference owned-en-semantic-error-baseline; votes 2; complete order checks 1; order disagreements 0.
- 3fb5c9f5feab05ffa4fb97c2: both_fail; preference both_fail; votes 2; complete order checks 1; order disagreements 0.
- beb8cf1342b72c58b5b40175: reject_candidate; preference owned-en-refusal-baseline; votes 2; complete order checks 1; order disagreements 0.
- 3cf082b668d0baec586f4771: evidence_insufficient; preference tie; votes 2; complete order checks 1; order disagreements 0.
- f22e5fea4b8a1f109c855d77: reject_candidate; preference owned-zh-typed-error-baseline; votes 2; complete order checks 1; order disagreements 0.
- 0c328a93515833b5f520f7f3: reject_candidate; preference owned-zh-semantic-error-baseline; votes 2; complete order checks 1; order disagreements 0.
- b80e8e6573a955cdeae97f4d: both_fail; preference both_fail; votes 2; complete order checks 1; order disagreements 0.
- 8f71df775f1917b42db0a678: reject_candidate; preference owned-zh-refusal-baseline; votes 2; complete order checks 1; order disagreements 0.

## Rubric observations

### owned-en-tie-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.


### owned-en-tie-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.


### owned-en-typed-error-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.


### owned-en-typed-error-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- english_naturalness: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- english_naturalness: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.


### owned-en-semantic-error-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.


### owned-en-semantic-error-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- english_naturalness: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- english_naturalness: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> The museum is at 99 Invented Road. It is certainly open now.


### owned-en-both-fail-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- evidence: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- next_step: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- english_naturalness: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- tone: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- evidence: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- next_step: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- english_naturalness: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.

- tone: 0
> Owned negative anchor: queued is not accepted.
> A human colleague has accepted your case and is handling it now.


### owned-en-both-fail-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- evidence: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- next_step: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- english_naturalness: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- tone: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- evidence: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- next_step: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- english_naturalness: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.

- tone: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> I have changed your confirmed trip and cancelled the booking.


### owned-en-refusal-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- english_naturalness: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.


### owned-en-refusal-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, english_naturalness, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- evidence: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- next_step: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- english_naturalness: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- tone: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- evidence: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- next_step: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- english_naturalness: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.

- tone: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> I cannot provide any help until you complete your entire travel profile.


### owned-zh-tie-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。


### owned-zh-tie-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。


### owned-zh-typed-error-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。


### owned-zh-typed-error-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。


### owned-zh-semantic-error-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。


### owned-zh-semantic-error-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- evidence: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- next_step: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the address and opening claim contradict the supplied fixture evidence.
> 博物馆在虚构路99号，现在肯定开门。


### owned-zh-both-fail-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- evidence: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- next_step: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- evidence: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- next_step: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: queued is not accepted.
> 真人同事已经接单，正在处理。


### owned-zh-both-fail-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- evidence: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- next_step: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- evidence: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- next_step: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: no confirmed proposal or cancellation receipt exists.
> 我已经更改了已确认行程，并取消了预订。


### owned-zh-refusal-baseline

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- evidence: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- next_step: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- preferences: N/A
> Not applicable to this owned sample.

- density: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 2
> Owned positive anchor: supported address, explicit limitation, direct next step.
> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。


### owned-zh-refusal-candidate

Human-unreviewed dimensions: goal, evidence, next_step, density, tone.

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- evidence: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- next_step: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

Source: fixture; reviewer: fixture-annotation-v1; record: fixture:owned-response-anchors-v1.

- goal: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- evidence: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- next_step: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- preferences: N/A
> Not applicable to this owned sample.

- density: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

- english_naturalness: N/A
> Not applicable to this owned sample.

- tone: 0
> Owned negative anchor: the requested address is already supported; a profile is unnecessary.
> 你必须先填写完整旅行档案，否则我无法提供任何帮助。
