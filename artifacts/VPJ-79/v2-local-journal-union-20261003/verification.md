# Local model journal — formal current-checkout union

2026-10-03. Independentbranch `codex/vpj79-v2-local-journal-integration-20261003` basedon fixed **unmerged** #627head `570bbf0a072b6c16dd1a70bbbadcf5f42db1bf7d`. Originalb64 requestbranch preserved. Union contains only reviewed ownrequest/output/consumer eightcommits from14278→b64 plus559dedicatedc6ce/e039/0d949/aa759 fourcommits. Every importedcommit changed only this batch'smodule/test/SQL/evidence paths; nootherownerhistoricalmerge taken.627 mustmergelegallybeforebatchPR.

## Formal source adaptation

- Ownercanonical/realjournalprep moved to `tests/integration/turn/planning-v2-canonical-sql-consumer.test.mjs` and `planning-v2-real-journal-consumer.test.mjs`. Bothload **every actual checkout migration** in filename order and import actualcheckoutTS normally. Canonicalgoldens read currentdedicatedcontracttest constants, notGitobjects. Priorhelper-absence assertion retired nowthatactualfulljournalexists.
-559`planning-v2-model-local-journal.test.mjs` uses currentoutputmodule ordinaryimport; historicalgzipmoduleloader anditsnewfixture removed. NohistoricalSQL/Gitshow/gzipruntime usedbythethreeformaltests. Historicallogs/sources remain their originalcommits/evidence.
- Soleauthorizedregistry edit: threefiles registeredexistingisolated-postgres lane, usingexistingVP_TURN_DB_TEST andpinnednetworknonePG; othersteps preserved. Registryclassificationpassed.

## Actual checks

PASS `pnpm test:integration:db --lane postgres` onceon thisactualunion/sourceadaptation: isolated-postgres28files215/215154s; journeys-pages1file5/5 7s; journeys-goal-index1file8/8 8s. Total30files228/228,0fail/skip/cancelled/todo,169s summedstep time. This necessaryregisteredrunner/sourcechangegate freshlycovers full19/20wire,lostwrite-returnreadback,UTCmicro→ms,NULLstrictrejection/triggerrollback andrealbinding/ledger/actorfixtures. Scope is controlledsyntheticlocalPG, notGoTrue/JWT/provider/targetacceptance. Owncontainers cleaned bytheirtesthooks.

PASS typecheck/lint/docs/registry-list/diff. No unrelatedfrontend/native/HTTP/providerlanes,buildoroldpurematrices repeated. Dedicatedpuretests' reviewedunchangedmoduleevidence reused. Newformalconsumerloadingtestcases were executedbyregistry above, notskipped.

## Boundaries

060000 isactualcurrentcheckout append-onlyprivateSQL withallAPIEXECUTErevoked; noledgerwrite/providerpermit/workerhook/completiongatechange. Journaltimestamps/observations/output/amounts arelocalrecordfacts, providerOriginVerified:false/executionAvailable:false/readyForPublication:false/reconciliationRequired:true. Paidpermission/provenance/executor/fullcompletion/target/realdevice/fullparentacceptance remainUNRUN. Existingfixturesincludingactualsettlementare syntheticdisposableledger operations.627base isnotmainuntilitslegalmerge; formalPR waits for that dependency andMainreview/allrequiredCI.


## Same-batch local HTTP flow increment

Mainauthorizeddedicated561four-filecommit `5e135e44e9fd837dced195c2fb81d46e8a2c316e` wascherry-pickednormallyonly; nootherownerhistory. Its originalpreparation+source/evidence are retained. Test movedto `tests/integration/turn/planning-v2-local-model-flow.test.mjs`, nowallactualcheckout migrations/ordinarycurrentrequest-output-journal imports; removedGitshow/tempSQL/TSsnapshotloaders. Solewriterregisteredthisoneadditionalfile inexistingpostgresstep;registryclassification/syntax/diffPASS.

Only newaffectedtest ran: `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/planning-v2-local-model-flow.test.mjs`3/3PASS0fail/skip/cancelled/todo7654ms. Real127.0.0.1ephemeralloopbackHTTP receivesexactbodybytes/payloadSHA, Nodefinishrecordsonecaller-localACK, actualSQLresponsecommitthencontrolledthrow simulateslostwriteACK; sameuniquejournalrow exactreadback recoversrevision3/norepeatHTTP. Timeout/disconnectedleaveunknownsticky/noretry/oldleaseblocked andledgerstilldispatched/unchanged; noartifact/Turncompletion/settlement. Ownloopbackservers/sockets/network-nonePG cleaned. Thisfake-providerlocalobservation isnevertrustedproviderorigin orpaidpermit; allfalseflags/truereconciliationretain.

Prior0436fullregisteredlane228/228sourceevidence remainspre-increment; it was **not** blindlyrerun forone newfile. Currentregistry31fileswouldincludeadditional3cases; finalheadwhole-laneCI231countremainsUNRUNuntilactualCI, notclaimedfromsum. Typecheck/lint/docsfrom0436unchangedruntimecontentreused; only MJSloading/registration changedhere. PRstillwaitslegal627merge.
