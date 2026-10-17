# PR735 exact UTF-8 receipt binding repair

Original consumer base f36ba139, independent branch `codex/p0-nativeqa-receipt-bytes-20261016`. Original status-UI branch/head acefd9dd is preserved. Shared ServiceView input/history/message presentation hunks remain released to Main; this repair never edits the View, Main bridge, Root, PBX or ScopeGuard.

Swift String equality applies Unicode canonical equivalence. A pending original U+00E9 and receipt U+0065 U+0301 compare equal despite UTF-8 C3 A9 versus 65 CC 81; the inverse is also distinct in bytes. The old Store guard cleared the immutable command and showed recovered history for either mismatch.

Product commit dc5c1d06 adds only `NativeQAPending.matchesOriginalInputBytes(_:)`, which decodes originalText and compares its UTF-8 elements exactly, returning false for undecodable input. Store.recover calls that helper instead of String equality. No normalization, trimming, re-encoding, mutation of original Data, changed fields/wire/transport signature, new storage or state/UX change. Main owns the bridge's corresponding helper call and Main transport test.

RED: added the two-direction NFC/NFD mismatch integration regression against original product. Swift String==true and Data!= asserted; 18 methods executed, one method failed with eight assertion failures across two cases: ready instead of unknown, clearCount1 instead of0, removed retained body, and visible message history. The same-byte NFC/NFD positive and original ASCII foreign-input negative passed during RED.

GREEN: final actual Contract/Store + original NativeDataScope definition tested by `python3 tests/contract/ios-realservice/run_consumer.py`, 18 methods PASS/0FAIL/0SKIP. Different UTF-8 receipt input does not clear pending, leaves exact posted body Data, stays unknown and displays no recovered result. Exact same NFC or NFD bytes clear once and reach ready. Helper itself is asserted false/true on these cases; original ASCII foreign receipt remains covered. These tests use an explicitly synthetic transport with no HTTP/Auth/provider/Keychain/data POST and are not target acceptance.

PASS diff whitespace/allowed path review. No127/full matrix rerun, no simulator/DerivedData/signing/device/TF resources used. App integration and Main bridge behavior remain UNRUN by this owner; Main is applying and testing its own bridge fix. Source and before/after SHA256 are pinned in pins.json. No additional review/PR/merge or production operation is claimed.

Stable product early handed to Main at dc5c1d06; only evidence follows. Owner STOP after receipt, no in-flight/planned/successor write. Status UI and its separate draft fix are not included in this branch.
