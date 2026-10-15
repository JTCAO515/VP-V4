# iOS continuity and maximum Dynamic Type repair

Base QA b993da2b18cf374b8b1e7c05834aee21889ea72d; source head 9891052926210b673d47bfcb032ae84277fc8cff. Related #203/#233 and delivered #692 continuity. Main integration writer; original Library/Chat/Sidebar owners retained their exact scopes and dirty resources. Local source commits 6cd6a8ac,6206e703,cbf3d760,dc37d73e,e0eadc06 integrated without reset.

## Before and after

- Before FAIL: Library passed body rather than exact material identity. Runtime312/313 showed readable material body but no associated journey action.
- After PASS: runtime337–346 Library sample-plan → Chat readable same title/body + frontend.chat.journey → same sample-shanghai detail. Missing/deleted/unlinked/orphan/current-material boundaries: 21 actual-source pure assertions PASS.
- Before FAIL: accessibility-extra-extra-extra-large sidebar history heading ellipsized; fixed notice consumed history viewport. Original screenshot retained.
- After PASS: same largest system size heading/notice wrap fully. Shared scroll reaches sample-history; exact fresh-target touch selects its messages and dismisses sidebar (351–358); new-conversation control returns quiet empty Chat (360–362). Normal size restored to original large; four tabs, original asset and header preserved.
- Source semantics: background Chat scroll/composer/header marked accessibilityHidden while drawer is open. Runtime snapshot still lists some underlying targets; this is not proof of VoiceOver focus exclusion. Actual VoiceOver/device remains UNRUN; no fabricated PASS.

## Validation

Main owned simulator 8F6CA72C-73C0-45C0-8606-0543B1F725BD / iPhone17 iOS26.5, Debug CODE_SIGNING_ALLOWED=NO. Dedicated continuity DD/profile; no other resources touched. Initial integrated build40.0s PASS (6 existing warnings retained); final98910529 incremental build27.254s PASS, PID85343. No production/Auth/provider/persistence/booking/payment claim.

Pure21 checks, Swift parse by leaf owners, docs:check, diff:check PASS. Full formal65ec Standards no hard violations/P3 duplicate formatting, Spec0; owner repaired to shared projection. Final98910529 delta Standards0/Spec0, unaffected same-source full review remains applicable. Reviews attached here. Applicable remote CI/normal protected QA merge pending at evidence commit; PR records final state.

## Retained limitations and failed observations

Tab AX tap initially reported success with no navigation; normal touch succeeded. Expired snapshot and ambiguous text selector errors retained in session logs; refreshed identifiers used. A stale/intermediate history AX action reached Journey rather than requested history, not counted PASS; final fresh snapshot+touch sequence observed intended history messages. Original Chat/Library push SSL_ERROR_SYSCALL and Sidebar GraphQL EOF retained; Sidebar normal push later succeeded. Main local integration did not proxy a rejected approval or change credentials/permissions.

All UI data here is explicitly local presentation sample. Full #201 real login/confirm/two-client reload/device file protection, #212 supplier-device parameters, #506 Chinese-address producer, real VoiceOver and release remain separate unfinished scope. No frozen #229/E2 or expired database window resumed.
