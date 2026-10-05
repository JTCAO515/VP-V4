# acb Simulator crash and minimal lifecycle change

Failure: run37333453936/job111842129926 at acb5ea21; actual artifact11355376735.
Full tests.log and filtered actual Oct5 IPS stack retained beside this file.
Native Community14 PASS; old NativeAskPersistence real device-only Keychain case
crashed before assertions with malloc pointer-free error/SIGABRT. Faulting thread16
is libswiftCore release -> AXCoreUtilities -> TextToSpeech -> Foundation runloop,
with no app frame. Main thread was NativeSession.login/clear/device-material FS.
Do not label this a Community assertion failure or infer a Keychain bug.

Actual source15ee4662 removes eager AVSpeechSynthesizer construction in every
NativeSession's system voice driver. Optional engine is created only inside explicit
speak after original active-app/installed-voice/recorder/speaking/audio checks.
Init, recording guard, stop, pause and resume never create it. No recording/ASR,
Guide TTL/progress, translation once, permission, privacy, Keychain test or gate change.
Main granted this exact hunk after prior owner release; no second writer was created.

Isolation: XcodeBuildMCP.test_sim on own VPJ48-LazySpeech-Isolation simulator
B8FA585F-9BFB-49C5-B471-234484BFBB3F, Xcode27/27A266a, iOS26.5, own derived
/tmp/vpj48-lazy-speech-derived, ad-hoc signing. Exact failing Keychain method plus
existing NativeVoiceAudioTests and NativePlaceGuideAudioTests selected. MCP reports
13 discovered tests, no errors or testFailures, and explicit Keychain testcase passed
87ms. SwiftTesting counts were not separately preserved by its structured parser;
do not substitute discovered count for an observed count. One selected run only.
Own simulator was already Shutdown at cleanup, then exact own delete succeeded.
No other simulator/resource or true microphone/supplier/device was touched.

Interpretation: source initialization behavior improved and selected check succeeded.
An eager-TTS causal link to the old Apple framework illegal free remains HYPOTHESIS;
one green run does not prove the old crash root cause. Final new-head CI must run.
