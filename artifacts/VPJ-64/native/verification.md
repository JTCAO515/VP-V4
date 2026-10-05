# VPJ-64 J2 Native consumer

Native product source fixed at 5b9155a9a6c45b393026cc9d1d7826b56f17b869 (branch vpj64-native-community-safety-20261005, owner 01a10c7a-a872-7d80-9a61-1d1467581c52). Prior owned commits 1bc748e1, 7125943e, 8c1dbd97; normal merge of approved J1 e23b64b0, no dirty copy. Main precise shared lease covers Profile entry, new Session transport/journal/cleanup, F164 memberships, and a J1 detail link passing only the own submission ID. Sole TS owns the combined PR; Native does not open a second PR. The latest independent J1 SQL correction and final J2 SQL must be integrated by the sole TS owner; the inherited e23 checkpoint alone is not a merger approval.

Implemented: lawful server object selection/read/report/block, own block/unblock and disposition/appeal with asynchronous receipts; explicit bounded input/consent; source/copyright/trusted disclosure display; unique protected exact-byte unknown-ACK recovery/read/abandon/retry; CAS, request-start TTL, server expiry, current actor/session/epoch/endpoint/generation and credential-expiry display fencing. The final collection-switch caller cancels and fences the previous query before loading the new selection. Ops review stays with the single TS producer. No manually entered target or guessed staff status.

Actual module export/delete callers use the final canonical keyset, including owned authoredDecisions and readerGrants. Export validates all bounded arrays and complete scope; no foreign reporter identity/reason/body or raw mutation bytes. Unique temporary protected files are removed on expiry/background/navigation/account change and abandoned copies are purged on startup; failures fence actions. Session erases the safety journal before the legacy preserve branch, verifies cleanup and fails with storageError. Original journal, Guide, Voice, EntryResume anonymous first-login and J1 recovery contracts remain intact.

## Observed checks

- PASS: actual full generic Simulator test build r2, final test build r5, final unsigned generic app build after the collection-switch fix. Simulator app signature was ad hoc, with no distribution identity.
- PASS: r2 actual 12 NativeCommunitySafetyTests, zero skips, reconciled to 12 declared tests. Earlier WIRE estimate of 13 was incorrect and is superseded by the observed source/log count.
- PASS: r3 only the two affected original J1 denial/cleanup cases, zero skips. Their r2 selectors omitted parentheses and matched no cases; they were not counted as passing in r2.
- PASS: final r5 only three affected existing cases, zero skips: independent outer49152/ordinary24000/inner10000 limits with exact original TAB bytes; actual Session headers and expired credentials; verified cleanup failure/retry. Unchanged r2 states and r3 legacy evidence reused.
- PASS: six offline fixtures emitted by the actual Swift command builders and accepted by the sole TS canonical parser. This is typed-wire interoperability, not live authorization or GoTrue.
- PASS: all three owned iOS26.5/iPhone17Pro Simulators were shut down and deleted. Other simulators and resources were untouched.
- PASS: project plist/scheme, docs check and diff check. No Web/DB/provider matrices run by the Native owner; those belong to the sole integrator/SQL owner.

Runtime tests used URLProtocol and injected vault fixtures. They executed the actual NativeSession transport/cleanup; they did not use the preliminary stub Session. source-manifest.json pins the final native source. r5 tested the final core before the one-line collection-switch caller change; the unchanged Store.suspend late-generation negative from r2 supports that caller and the final generic build verifies it compiles. No required CI result is transferred to this local commit.

## Preserved failures

The first actual app build failed because the view assumed NativeSession had a locale and was directly injected. The view now uses the existing AppSettings/nativeSession/selectedLocale pattern. Preliminary stub SDK typechecking did not prove the app's environment injection. Hand test-typecheck attempts initially lacked Testing framework/macro paths; corrected compile-only checks are not counted as runtime evidence. Raw failed logs are retained, alongside passing logs and exact executed commands.

Target/backend ordinary auth, real user/device/accessibility/human, public J3 and cross-cache J4 remain separate: see unrun.md. This Native component is complete within its owned J2 scope; whole #238 is not closed.
