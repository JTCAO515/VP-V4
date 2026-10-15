# Historical canonical Native report materials

This is a lossless archive of report-only material superseded by the authorized three-line Native mode and actual product App/test validation. These are historical snapshots and one-off candidate/shadow records, not runtime/test inputs or a new hash baseline. Their original candidate-only, FAIL and UNRUN limits remain as recorded in the unchanged evidence reports. Later actual product validation remains separate. No result or original byte was discarded.

The original paths below are historical identifiers, not live links. UTF-8 text is encoded as a JSON string to preserve every newline and trailing diff-context space; decode its JSON value and encode UTF-8 to recover original bytes. Binary gzip snapshots use base64; decode without decompressing to recover the original compressed bytes. Each payload retains original path, length and SHA256. Actual contract fixtures and allowed `.log` / `.log.gz` files are untouched.

Checks: no product source, test case, assertion or runtime data changed; repository search found no external runtime/test consumer of these artifact paths. The retired sync script only referenced these private historical shadow records. No sync, simulator, SDK, App or backend work was rerun.

<a id="payload-01"></a>

## mode-candidate/NativeAskModels.swift.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/mode-candidate/NativeAskModels.swift.patch`

Byte length: `985`

SHA256: `e5f18314233df49bf6a8593276882a1f8e8a3bfafc4e6417e4350df93fb9e1ac`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift\n+++ b/ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift\n@@ -119,9 +119,9 @@\n }\n \n enum NativeAskMode: String, Codable {\n-    case currentInput = \"\", taskContext = \"task_history_v1\", grounded = \"knowledge_intent_v1\", assistant = \"assistant_conversation_v1\", unavailable\n-    var usesTask: Bool { self == .taskContext || self == .grounded }\n-    var version: Int { self == .assistant ? 5 : self == .grounded ? 4 : self == .taskContext ? 3 : 1 }\n+    case currentInput = \"\", serviceTask = \"service_task_v1\", taskContext = \"task_history_v1\", grounded = \"knowledge_intent_v1\", assistant = \"assistant_conversation_v1\", unavailable\n+    var usesTask: Bool { self == .serviceTask || self == .taskContext || self == .grounded }\n+    var version: Int { self == .assistant ? 5 : self == .grounded ? 4 : self == .taskContext ? 3 : self == .serviceTask ? 2 : 1 }\n     var base: String { \"api/chat/native/v\\(version)\" }\n }\n \n"
```

<a id="payload-02"></a>

## mode-candidate/manifest.json

Original path: `artifacts/IOS-003/canonical-ask-20261015/mode-candidate/manifest.json`

Byte length: `342`

SHA256: `3e5cd4709dfb9241583ca44ea78de6982bf781f51b483af46a820060e497891b`

Encoding: `utf8-json-string`

```json
"{\n  \"path\": \"ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift\",\n  \"beforeSHA256\": \"0181f41629bc8dd749cd9b8523b31089b191d2b2082bed759304569dba0cf453\",\n  \"afterSHA256\": \"58fa4520f063d73dd3acd7c086afd5b99d4340b1c9ea891fc1309a099a994841\",\n  \"applied\": false,\n  \"scope\": \"NativeAskMode three lines only; legacy schema1 body unchanged\"\n}\n"
```

<a id="payload-03"></a>

## own-resources.json

Original path: `artifacts/IOS-003/canonical-ask-20261015/own-resources.json`

Byte length: `176`

SHA256: `77c30d51cd2d034bcf9bb4cffbe2f0392a2e82fdae4d4b742321a188e9dce5ce`

Encoding: `utf8-json-string`

```json
"{\n  \"name\": \"IOS003-Canonical-20261015-f0d7056a\",\n  \"simulator\": \"22BA88CC-D299-49FC-8EA7-F5CBE980202D\",\n  \"derivedData\": \"/private/tmp/ios003-canonical-ask-dd-20261015-own\"\n}\n"
```

<a id="payload-04"></a>

## product-inputs.json

Original path: `artifacts/IOS-003/canonical-ask-20261015/product-inputs.json`

Byte length: `73196`

SHA256: `16a8d24d22cf222a9687bfce6f4465bd0eb91b8ba4c16099598f65e129ca4647`

Encoding: `utf8-json-string`

```json
"{\n  \"head\": \"aeff46f04c0d5c1299bb7ff46fa170f0db0a5b84\",\n  \"referenceShadow\": \"/private/tmp/ios003-canonical-shadow-5528f7d3\",\n  \"referenceLog\": \"/private/tmp/ios003-canonical-shadow-tests-r5-20261015.log\",\n  \"mismatches\": [],\n  \"fileSHA256\": {\n    \"ios/VisePanda/VisePanda.xcodeproj/project.pbxproj\": \"367ae8bde03539b720ffb0bc85cee4c0640e6b77e785928b4346b68a5ba3c087\",\n    \"ios/VisePanda/VisePanda/App/AppSettings.swift\": \"78a6f29eaaf6d11736bdea307e2d9894dab4ea91c1d9733b8c3d49b94f0de477\",\n    \"ios/VisePanda/VisePanda/App/AppShellView.swift\": \"ccdc61b88175f2ea43a46d2022539506643718e0969bb8394cfc89567b2c1d7c\",\n    \"ios/VisePanda/VisePanda/App/NativeSession.swift\": \"55e46fe451c914a600962c9af5c0a410c2ac2b5d99a7cf2ca43fe399645e073b\",\n    \"ios/VisePanda/VisePanda/App/VisePandaApp.swift\": \"440c3e020cf011655fe40e2d32330d50f61d23101150850dd0a164a1022a147f\",\n    \"ios/VisePanda/VisePanda/Components/BrandHeader.swift\": \"29dbcbe5e1522d722a18d9e651d5f20b77451e38c4e6defe4153dbcd4087ec16\",\n    \"ios/VisePanda/VisePanda/Components/CapabilityCard.swift\": \"e382de5a2dd3c74f770f61b87859af330cf4b52d68b97f381481a9282790823f\",\n    \"ios/VisePanda/VisePanda/Components/PreviewStatusBanner.swift\": \"04a339413887954b492c1467d50240b4c6c0666211d81de3651b19cfd484fe49\",\n    \"ios/VisePanda/VisePanda/DesignSystem/VPReadableText.swift\": \"0150211ce6eb42f7dd8498dfff9504ec495140f4f810ac9186a0ad5864dc9a31\",\n    \"ios/VisePanda/VisePanda/DesignSystem/VisePandaTheme.swift\": \"3b9a21b8a3e6da9e2a6097e64a48355b386c2600218ca7048f95fd02e7617db6\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataCommand.swift\": \"96dc196c1879e003026453afc1c2bb11f5806f2b15ad05722f110677a9156d2f\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataConsumer.swift\": \"1cfe83bb58a0068fb6d4f502c8723212b4ba86d63ba373ce0241aefc7c67ff69\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataCopy.swift\": \"eb0d7fd66f203ebfb5ac1a7c21212ead2bfba31ec192c8ec2809c7231625590a\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataDeletionConsumer.swift\": \"ccdafd2c157bee13ce49d69f8df19602cbbc95568abb00cea5889d01cba3799c\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataExportFile.swift\": \"b59c300a1421a8b937981de95bd2662111a2cc7ffbf0901260a605da5f940b0f\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataJournal.swift\": \"5ca2be21137fe192d2ca14daacdbc662ecdbc2efc52e5575d1819f8233076bfa\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataLifetime.swift\": \"74a8529f1c0d3cb8de74d976599f5b38c5ed9e9be7ee867911ca615a38132731\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataModels.swift\": \"124e09a746bb7643d8b8e8586075d37eb4038d62e5302b8607f0cf7de166fdd3\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataProtocol.swift\": \"fccfd716715614d6f8c2beb73a54f9b1df7b21ef57bf27b1efbd6b5610d006fc\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataRows.swift\": \"8431fdd67b554eb4e1d9215df1a268292d3d951033975ff9bd0915dae93fc1e2\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataStore.swift\": \"4f68ace203353ff0a77fe641454308b10bba721a5d8b795f6995fd4c4c2cab6d\",\n    \"ios/VisePanda/VisePanda/Features/ArchiveData/NativeArchiveDataView.swift\": \"f3d965741260d34465e2c6e7ccadca52790bbb8ec61446ec31fd02b6b2173bac\",\n    \"ios/VisePanda/VisePanda/Features/Ask/AskView.swift\": \"a108227994b8e5841329c08b8a21c4a047b5d3c09d8d3911708b977c7a02ba58\",\n    \"ios/VisePanda/VisePanda/Features/Ask/AssistantSpecimenView.swift\": \"3f82ba9a9188ebc86ce6243c69ae5991d0db3b8768a71db45502c9bb9be44494\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskEvents.swift\": \"14fb02de97352922af9f81e1ab17c537197e95307d9b8e850f65347f1b5d1af1\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift\": \"58fa4520f063d73dd3acd7c086afd5b99d4340b1c9ea891fc1309a099a994841\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\": \"73d036539b0742d683b05caa8edfc529f1e09560f9316d43778f37b2a4f388ec\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\": \"6e28c02350d9ac6fc5dde9b231f314bc4503159fe1048e09078f458059bed947\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\": \"0bebc4ccefba5df10da60c28018a15f5e6a919ed1f4f976ac315c2072c1c53b5\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeQualifiedDelegationModels.swift\": \"4c59c0f7a2d268db4ab20f8fc9e522ac9ae1fc65d841f55b75abf23f55e33d56\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeQualifiedDelegationStore.swift\": \"0f4c92ac1c3a2d343bbecafa24ebc4b3f01f39d4f10ff39a81c783aa75525305\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeQualifiedDelegationView.swift\": \"7135148e0bc504bd65d73666272fa57422de928992d340e61a83ce164a2ef13e\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeSelectedEvidencePicker.swift\": \"dbcbb1a31297317f4bae3ded7b57f8ce88bb5c591d925c98a34f46d8b62a66d6\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeSelectedMessageModels.swift\": \"d514654fdc6652c0613fd1ca45b1699bbf597fc377e053617aed023e8eb32565\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeSelectedMessageStore.swift\": \"990e18bc49abfe158cf92675ed3c269f88452c5e0d3d0cabf957d2d54967b85c\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeSelectedSourcesView.swift\": \"301f8f5be279cfed02ea17a703ff182ce4b66a49bd9efc6bceb4c96ac94eee25\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTaskActivityModels.swift\": \"ea9a8faaffd5440140e8c5aad1a0d21edd1ba4ed4f3835fd8c8892a049736a38\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTaskActivityStore.swift\": \"0679a73fff0ea6d8c2db9b70dffd46d781f2d57ab7baa101a900ffe07e54e090\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTaskActivityView.swift\": \"d2f3200e69e6ce04e047ddf924e70b4e1b9aafb2192b27c8f397b8be6854df98\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeInjectedHarness.swift\": \"fc72e51ee4fdc3e2a412bbab4b9264a4ceb70f7727c4f45f2a7f055d980bbd63\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeModels.swift\": \"2a6ad0122bfe1703741d72c98ee3ce409557f61399cd4fa333923fbe381f2e0d\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeStore.swift\": \"dca4009db47b08ce080a3e83af8bf5ca4fa92d0cd41c92beb503dd7eb159a195\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeTravelIntakeView.swift\": \"361bdc6fea460185cdef2c7f10bfcb00201e534179161a3b042aeb2087421d00\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeVPTravelPaceStore.swift\": \"d8aba59836c686c07c9407b2e55f6c74afe7a60bfb1c645ddea33fd434d7a7c6\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeVPTravelPaceView.swift\": \"cf904882e5d455d7e8ddc160c4e377c7d5e86548476bdc7dac556f87f3c156e2\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsCursor.swift\": \"635492bcfa87cbc9faa329e518db5c8e118fd1ecc1f40d598e02a7da64a35575\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsDecoder.swift\": \"f4e4a011c3facdd6abc9a6190c1aad36a6e2667d5b5c836ccf736168d1a74c6b\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsInvalidation.swift\": \"4b7ba1d3ea074490a64121269c07d42ff4b7840b0a4f6924d18982a768059ed5\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsLifetime.swift\": \"9025d22421d0723c6b69c71df08f714b82d65537280b7513ee84033c4ff9ddbc\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsProjection.swift\": \"eb734f1b73f2de1a74e00ed0af36e431f56b699d9e9780272fa6fc79e21c33bb\",\n    \"ios/VisePanda/VisePanda/Features/AssistantEvents/NativeAssistantEventsStore.swift\": \"02a447e8d79f5977b58dd3bcca79488611619fd4683ceae5dc242497bc68b457\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceAccess.swift\": \"88ad10938993f44c03c2c204645440cf142f8674b953b99dce7cf50de6ea91ff\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceCommand.swift\": \"a99af087cda9ff22223d45c8dff0ffe0918eabfd14ef27219f26dd03d1a785d4\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceExportFile.swift\": \"a87d3b0ef61074d0d4b2230e3f1c1855a9af1607d1dd865fffbabb5621591ee6\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceJournal.swift\": \"a471b0400c73be008fe212ac5a68a5c3e3104aafe656d1eb9eb51699036448a1\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceLifetime.swift\": \"41f10f2970889a1faf63b4c848f64565cf565d3944060b9d38b98d0c26cefb13\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceModels.swift\": \"3162b2b6f0ac7795c2c0a719104e264f532a96323a1e4c08b0ffb5f541644785\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceOutcome.swift\": \"1a43627a7074c5c29ad48bab767c7cf7c48411ef44c0298ecff316bd4c3c06e6\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperiencePlaceActionsView.swift\": \"7fc2a745be1627306f5232b4dd53a9e25973b95052d16def1f8ffb02d721cb84\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceReadWindow.swift\": \"62c41ab9a244160d7e0e686774484b1436ef33d7d7c58b82c7dfedf8b283165e\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceStore.swift\": \"5de62c5364bed96bb2d8f02f8009061015b0ea508bf311bbfe2d415278cecf8f\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/NativeExperienceView.swift\": \"3ab8809de0e5eae3aa486e11d073c04839c3a250b57f0fd88ca7356f1b28c3c2\",\n    \"ios/VisePanda/VisePanda/Features/CommunityExperience/WIRE.md\": \"6609f4734990912964d4f7e0c7fdaed0afcf2245323c3e26fcd59677c74ef03f\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyDraft.swift\": \"eef0be97ad21300f696fe8272d49e70dd75d804145abe4a0689dfd1f3441547c\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyExplanationForm.swift\": \"22d9c72d39ae3862734df7822a819f8013f5727dbc79ed4300843c3185602b39\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyExportFile.swift\": \"1d34e67f9e295038371e246917cdff85da7eee224b280931e42a386bb05db908\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyJournal.swift\": \"0f372bacd2bf7067063aa2bfc98bf8964b2e6620dc7840aca0dbee302611fac9\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyStore.swift\": \"4c84bd80caeb4c538db89fd56e30a6b7cd24f0cf77f204e968a6788d5aa27a07\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyUnavailableView.swift\": \"6443e3e6fcb6d1638fa4536543ce57a887cccf1f266dac4f37e98a8c26d40621\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyView.swift\": \"b922aea5c422efb0f31a5e769186151efe87bc35e1dfec591b5689aa94bf881c\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/NativeCommunitySafetyWire.swift\": \"e1f7505f5cad60a389369b7a46514fb7715b734af6fe91b5df75a00840134668\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySafety/WIRE.md\": \"8e4168fb86e7f7820a6f2ade1db78f34b2b9d9c6b873163761551a2e9118f344\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityComposer.swift\": \"b181d03fcf3175e0c10314496495f1af6e3ed46068184f9d00ce4860dc39c6b7\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityDraft.swift\": \"2dcc41afce6e464c4a69341d0a5560c60a6836e2334efb8d978f4b51b5e77510\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityExportFile.swift\": \"34a9ec37287c4d494bfc3fcc5bd4aed1b70a4c79c43ac93638f81674b630625a\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityJournal.swift\": \"68b06701d85f2968e8a90b61555935e4714cae1be1a94afae5e1725919bc2253\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityPlacePicker.swift\": \"5f55f3d19e0e62cd9e1a5545417f7163412ce07ee166886c5605e4986e84eb9a\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityPreview.swift\": \"5b1f2018c07422d3c03bfee660a3a9150beb9b23d361ce112a32a6fcb7874b54\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityStore.swift\": \"6b8c6c925d9fc6094f3880271d4ed0f7fd6de90bf432bc03f3ea5d39430a30f8\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunitySubmissionView.swift\": \"7cf767f4928168389b1bf96e009e2a49a73227fa9848b3d316c4b46c7e4aa780\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/NativeCommunityWire.swift\": \"25815abdf7a73eae86cc8982d83bb52848dc2888154bedf6d3334e04c9ed87b2\",\n    \"ios/VisePanda/VisePanda/Features/CommunitySubmission/WIRE.md\": \"c9526dba57be568032cc9e132b9aa70d868151d51311dcbcb7dcbb85f3cd4884\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataCommand.swift\": \"42ef45f94aaccbc66232a867d85a61ed3bc61f7056325ec3973c8ddffdb8e9e4\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataConsumer.swift\": \"af1288e7115c8b30bbdf66c22cd4083cddd104c933bd9c3194ce19cbb21a0ef3\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataCopy.swift\": \"e9e5cf033f5c3c53f4513488b15ccd0a2e0de3e14bdd4389c13cafd9ec10082a\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataJournal.swift\": \"bb70f06ed3dcf2af827835dee756e4f866e8c2996267ac4ec51b2e2e42303fb6\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataLifetime.swift\": \"aa77c310bd0f5a449e4c2f53d31e9c28b17952f31eb2f64926e1bd72582af333\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataModels.swift\": \"2b39fc797a709b44ff2b7c15a310e06612f752d50bf695624b94aeba90ffd0dc\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataProtocol.swift\": \"acbad525632807679b08234f3f596b684ab86ec0ae11c675708649fde6c6d180\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataStore.swift\": \"f1d11c2938cfb7a6abd00529253723cd08925c9e7000bc26d5d60aa700aa6f79\",\n    \"ios/VisePanda/VisePanda/Features/ConversationData/NativeConversationDataView.swift\": \"dd6fc36cbffc7c69a4804d0171b6507330d00d595c0050b8f6a64ac8fdaf5436\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/LegacyCoverageAssertion.patch\": \"535b3a5b337dc217051fa238a6bd66a70c5e2737d74e4b63992413f84f4572cd\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/MAIN.md\": \"f89296354eef4e7ca091c7014348ee4891e9d5d0a6ffd3f0b293d5750de7a32d\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressCommand.swift\": \"68cd7e5697c21a89998276385efab84fc6e84c125cf70d929e0d52d2f70da276\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressConsumer.swift\": \"b0cd3199b135c41559f8cea11181cabd2734bcf9ba0d4cdc6218f037507b24e3\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressExportFile.swift\": \"f0c2f973d397f04b6b39a82e31d20d550a059f7a4355c31296abf8f74097bffa\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressJournal.swift\": \"a4ff1421d3e79ea4bfa058a6d7796b2d79eba16954be98d7a30b7bdf894fcce7\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressLifetime.swift\": \"06dddfd6cb28d5807bb176f8eca8ac7058b94a9593f175ac4d2e3236a41b4a48\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressModels.swift\": \"f8cca4845b8c71751ca0a03f414e47aed7d7d4696013a1dd7d031a6f1abd3169\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressProtocol.swift\": \"95ab122a7c41674d44539e13723488bceab2e74f317e68a83a8bccdb61e1f840\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressRows.swift\": \"7f76db76ea69d1885cb212a5005b911bcb2888b21aa0ab6139482bc3134c03b7\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressStore.swift\": \"56c330e2f08d06445a460801a25c217a6676c3a11650577329acebf5f5bd31a0\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/NativeCoverageProgressView.swift\": \"1ae30b4a9f236423c48a793603deb33c4d325ec9a9d4938d27fb0a6362d0b67a\",\n    \"ios/VisePanda/VisePanda/Features/CoverageProgressData/SharedNative.patch\": \"f1887ae68ba4ae146ee1b55b0add61189110dd482dc654e69dce2e306b938ade\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageCases.swift\": \"780b48d4c43283d643568de0cb64de061cd2986b4593b4cc9353c1d650dfeabb\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageCommand.swift\": \"1199aad2787721e62f0da068a645885c27453b20aa161d9fdaa51500416fae34\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageConsumers.swift\": \"9bd3420c1ea81df3bfe83c05b510840065c1aa7f942a757ffa3825f8315600db\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageCopy.swift\": \"2a78c7e4bdc61ff5d916ee97f4c983d93fe858370ee147483547a3f894d8ee61\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageExportFile.swift\": \"b83ac905cf4f95098211c8630aa23a22c450d34013d41278036dc9fa7d572aad\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageJournal.swift\": \"61431ed3dfaf4bcc4f0cdc99a0415ab5a6c09da4311c3668ac2498819f5b4dc4\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageLifetime.swift\": \"320fa0669302bf7e1c1044576753c8c9a2863afed77f51a23932236ce268f0b9\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageModels.swift\": \"9c6f2a172a1731943e5ff327583284af35620ef515d50505d3946ffdb434fe34\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageModuleView.swift\": \"10e87439e4ac3114f38b03e3c250a7f3dfd32977ae10627f6728f89121b73e76\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageOfflineView.swift\": \"bab532855790a95700b09e3e64595c9d560f032844a9118d44b4cf3eacced0a6\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageOriginal.swift\": \"63679dc5f6722bd32e7cb8189f01bcaf43db5c419fcfdcd6118faeea5cbb6c46\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageOwnerBundle.swift\": \"3714f74eec545ce7ba5297de526d0d3d24e7745fbeb87179accb49d625526f21\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageStore.swift\": \"57e4657be9701946a1f4f0186399e98ae043c5ee1c5d4f8a7da5c66e1105a9be\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/NativeDataCoverageView.swift\": \"8212055041eb661c2e5da4a79ef14c37aeae706c081cb35ef12a478cbbde49a1\",\n    \"ios/VisePanda/VisePanda/Features/DataCoverage/WIRE.md\": \"5c61d82606ca827e6b35d217d63fce45bba5d6cdefbb99766feb0606022f3579\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/NativeEntryResumeCoordinator.swift\": \"f03bdd185d2bb244a56aeffaf2d94a8238b9739168fc93a23e5591029aeee985\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/NativeEntryResumeExport.swift\": \"09f8584b45606c05e538fe5b4b3c77854bc65c486f75ee6e2ca97163168776b3\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/NativeEntryResumeLink.swift\": \"26963914b414157a5a11ba98ac246a99c9aae0dcbb35adcfc54209a4b96f142e\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/NativeEntryResumeState.swift\": \"da028cebd5c86d81294db97783a4fb87519c2c9a8eb95e053f9de00b712dfbd2\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/NativeEntryResumeView.swift\": \"7d89241d51c19dc7dfa8d4b8f6df22cc5c43c8db7b6bc19076d5fe6493065df6\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/STATUS.md\": \"8ace638f936bce87901aef5583064ba92029e72f49c2aa6b2954a7d37f78a547\",\n    \"ios/VisePanda/VisePanda/Features/EntryResume/WIRE.md\": \"687c1cde4730f7b1f63a47fb7838694030a1134c2a2aa1d683b985e0b649ee6c\",\n    \"ios/VisePanda/VisePanda/Features/Explore/ExploreView.swift\": \"ef67a20a5c6f48f347dc05df0c1850ad6dae7b42ab2598c9e306b6281296c320\",\n    \"ios/VisePanda/VisePanda/Features/Explore/NativePlaceMapCanvas.swift\": \"1f3d051f87dece6233d9074f55d18f1a02818b866f494dd7ce15ab62826b637e\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Assistant/NativeFrontendAssistantDetail.swift\": \"77b74379fa5313bbb6ef0b215e14e2897c2a8917759bf588026a31a7fe886b25\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Assistant/NativeFrontendAssistantPresentation.swift\": \"ae5095ecc3618cc75fa7ab851ddfc6cd8c4294052c9d0e5eb9612e2c4ba9854e\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Chat/NativeFrontendChatSheet.swift\": \"e869d97e342773430fbc3688396b6acfe8f7bc8c6350e19626c16e2f6cf99862\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Chat/NativeFrontendChatView.swift\": \"d7a8e2df2e2a5ad54c15977a1fe0b62a66f7aa113829adb355d02d633cdfccf3\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Chat/NativeMuseChatHeader.swift\": \"caeb57457d5bb7314f19c1c6f9572297fe06214065019db0ef7157d47043b6e7\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/ChatComposer/NativeMuseChatComposerPolicy.swift\": \"e8d26b5596cf5bda3e9c2a72cef366821b46573de697246858d443dae350642f\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/ChatComposer/NativeMuseChatComposerView.swift\": \"e8e8e605214fcd002ac7bd24c04c5eddf48ac8dcf440e39399990c774b5267f3\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/ChatSidebar/NativeMuseChatSidebarView.swift\": \"3b49b03c5454538407b528e97dc3db47b640bedcfcc5124c47a48e0a13893417\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Expression/NativeFrontendExpressionView.swift\": \"ac4b0eb15b25fbb1e6047e4bd8c89b9d7b7a4de8f44feb72a73b667634c864b1\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/Journeys/NativeFrontendJourneysView.swift\": \"62a47faf12e62e44bcf95e8d8ae7b4a4368a1954d30d8a23f34357b90eea009f\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/NativeFrontendLibraryActions.swift\": \"24f2bc6518d2f152d74943616b79511ce2738aae251c6ba928b018e8e3819f36\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/NativeFrontendLibraryView.swift\": \"24cb10e9b129328b6d5c31c688f2a20c4f02dbc6639027038d8742e11034d37e\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/NativeFrontendMemoryView.swift\": \"edbefbbdc8904d4b20e0577d911611f6f67ef6cbc3b019b27584fc41413432cf\",\n    \"ios/VisePanda/VisePanda/Features/Frontend/NativeFrontendState.swift\": \"a6d4692a3f34ad09dbdbb547c3a3f2d2624bb2c8d45654bb3a40d9909e898940\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativeDataCoverageModuleView.swift.patch\": \"74e83203dfcc189a1985ebba6b7cc3211d20cacd9309999b005899cdb358dab6\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativePlaceGuideFollowUpStore.swift.patch\": \"e29fc69097f0ec22737f054c86c2e51c1357ee77a24f9722a7f0733d69fdfe93\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativePlaceGuideStore.swift.patch\": \"e3834b3a28d3ba47f0f7318b46b5ebc2ebd43e1a65dd3f70077be52c6934cf13\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativePlaceGuideView.swift.patch\": \"25ff68a6bcf061584de54b3a90259628cd488443ee27d326f1b7876c64404a80\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativeSession.swift.patch\": \"0f8833b7f41ae3406d768407dc06a6bae1be9d83cd3f8cb1bec8a194c452127e\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/NativeVoiceAudioController.swift.patch\": \"a431d598da55864b718b2f2af977a84ced9756023ff8c3db3ade625f67960e62\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/guard.py\": \"b35d263684017b59d3ec3f8d6d0c1feb0c04bd289c0dd87287791a42546e33c5\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/pins.json\": \"9791eb3f82dab28a4f07acd5374a32bd471a8c2a6a956f7ae42d2d7289d2f129\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Candidates/project.pbxproj.patch\": \"9b3f1956ff714e3290fd04a22eafb4715aed24ee476b4c2f43bace7fde969804\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r1-environment.json\": \"960196b9f8555d64e30839f52e8c809e82ef864ae9f6732ab09ce09f88847ac2\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r1-tests-interrupted.log\": \"9887e067cceadaeb6603e268fff6203294f66243ac0b2616443ccdf90859b23a\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r2-environment.json\": \"a20e8f791c7a57521e274b17c6ea72a75173f166e585c86a1e3794a7eee64972\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r2-tests-failed.log\": \"1b0a5b9f629d84202df9749494093cac025c93760ecc62304f5095998c9a8e90\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r3-environment.json\": \"afe054f570d1e0ee27437873642ba60e08b37e8ab3a7ccdca560bedb074f7a65\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r3-summary.json\": \"79b74b4cf8d50c940f09aa4ca39d7314d77ebce499145b7f02ef523db5f598b0\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/r3-tests-passed.log\": \"a2bb246799fc5a8d97aa95a4f97903820659d62c20ef8ba0654d2196318b795c\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/Evidence/verification.json\": \"061d0526c4fd11bcff6d6f6b8775126b232a09ed8d6ee575b3b49587e4a79c32\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/NativeGuideCacheDataModels.swift\": \"b6aecc288c4896e7cd57acc39f07c033a239f39a430e38e8de6ac7b0339218cf\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/NativeGuideCacheDataStore.swift\": \"d2a564ba63295ad396ef5c8c5f7e03183f194f6144f376b023e10f2bb8b42386\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/NativeGuideCacheDataView.swift\": \"5676571c25fe76bb6011e8ef5bc155e0ed583f68751234e52a42bcff1c48aba1\",\n    \"ios/VisePanda/VisePanda/Features/GuideCacheData/WIRE.md\": \"06317d97738780d1c4c982627ec71ff644b6f7483aab009bed255a377aeeb1bf\",\n    \"ios/VisePanda/VisePanda/Features/Hotels/NativeHotelHandoff.swift\": \"55364d68d7b253af52ce584d0b3a8d021b572bc9b8a651219998fa539ceaabf3\",\n    \"ios/VisePanda/VisePanda/Features/Hotels/NativeHotelHandoffView.swift\": \"f784f0cf808d8b510ba7d1a7ef59bea28981d804f829bcc1d42719c31a8ec5df\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeArchiveDataStore.swift.patch\": \"d9f89f3ae0bc5975a7a261aba5f970e56ab3fc6ec26d8173b564d1c0e48835c0\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeAskStore.swift.patch\": \"4e1675ecf87e42d98cb1894de099794c538cb66b9bb05f68dd917c40cfed07b5\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeCommunitySafetyStore.swift.patch\": \"74a2ee6e197073a8167d27753a3fda84b910e3872001c03bc1500297bb3d55be\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeCommunitySafetyView.swift.patch\": \"774513cae1834183f09594fecc3f4a76acaf89dcb5f36d5c635a4cb44d3bf718\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeCommunityStore.swift.patch\": \"511be9cf2bfc000d3544305224ebefc60d3e58739c06c2716cce6b8680d8e2dd\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeCommunitySubmissionView.swift.patch\": \"9908bf107d97bb430f7feb87f6eda1445558c46316815bb0303d1b81a0f75394\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeConversationDataStore.swift.patch\": \"a6f919f93eccfc937e39b864bd1d94d5a43495007428f90ba8b32c47b9e1bf04\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeCoverageProgressStore.swift.patch\": \"9bba1074c084e18f6fba8cea2c45513f850f66d6ffc4f66bb372be056c5c2bc5\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeDataCoverageModuleView.swift.patch\": \"dff7993c2b7c7307cb77ba507907a36765187090c0090f10f1852b471553d844\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeDataCoverageOriginal.swift.patch\": \"4f205dd5db627981be057c631ae110ac288bbc709077b968dac5642836839609\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeDataCoverageStore.swift.patch\": \"8243c08e2121cc5e2e9b6e2afb584b513500959a1331c0af43e839e2535da098\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeExperienceStore.swift.patch\": \"9de8b08561fe5f9103bc9cb15723176b16d5f90b0d94e5049b10a28aa3f50e65\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeExperienceView.swift.patch\": \"79b200fdbe175a52c2ba4a352ff4afb8aa2609d6c86acdbf1a8cf371901d066b\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeMaterialReferenceStore.swift.patch\": \"6b7a010633ce264da432bf74a1f30824e0064ea5c68aba0127e82bac90d6f164\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeNoticeStore.swift.patch\": \"d2877fa099ac480df81582ed9637aa6c10d17329ed788e2214678a608d92645b\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeNotificationDataStore.swift.patch\": \"13f87bb2b96425e6719ed9384894cd35b8c235475c9597f860e1c9cfac0ec23f\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativePDFIntakeStore.swift.patch\": \"204024c70ca0d5757df912e0a0f7b08003fff6144d04784c27a9a751552e780d\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativePlaceActionStore.swift.patch\": \"dcfa35317fddb6bc5680b5dd779231238ede39d67aaaabe9f2f16d2c54cc3136\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativePlaceActionsView.swift.patch\": \"790af9fc08fc98732761f7082e445562d4ea43874fcfcba1d2841ec95a616003\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativePlaceGuideFollowUpStore.swift.patch\": \"c865df752c9b5a16ebcf4a81c8f92f5a221c5ef9dcb4af4dd20c953b600084f1\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeProfileDataStore.swift.patch\": \"3b5383282766efad62f7e35ee85749ab39fa3caa45db86a66fb31604f8276081\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeRecoveryStore.swift.patch\": \"ba496477bda7e104249501b9a259466ce0b7192dd99194880b536566b483e4fa\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeRecoveryView.swift.patch\": \"74e01e3cc79cc65562377655886aca01ff1f817771d80cf8df507131084db200\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeReservationStore.swift.patch\": \"816f4828fd2ecf74c3e25b858e3a46cef8ee16cb5300a0b5402ce7610d5fdf23\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeReservationsView.swift.patch\": \"f28b9f0bcf46091ccde9be26bb4eee152eefe82e28fcc47ebc8a3b4c46ed4005\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeResultDataStore.swift.patch\": \"045cb37d3a5f8b586e8f2e7bd2dfa4fff919928ac592385f8eea61e86729f1ca\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeScopedTripEditStore.swift.patch\": \"1b19ffaf4ebd5e7b441c08d1ed3298a6f1377dc2180bad4c892aaa8f57ec7b7b\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeServiceOperationStore.swift.patch\": \"16ebe19e87e3e57a95bb8a03078fd941a9cb9debd4084bb9b255713ae891359c\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeServiceOperationsView.swift.patch\": \"8a72b5d00b809115b440e45ef085372f9dfb1efe7f8fec42af31fe0a6fea72b2\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeSession.swift.patch\": \"bfcbf176e1706954537efa4284a158b5ef1851290a883fd535c977736bb40ecd\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTravelRemindersView.swift.patch\": \"b7f078f96f815d986fad97697c0b9ff7a2e5379a64a5c16ebbb29ea2be4da318\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTravelerBriefStore.swift.patch\": \"3cc3cf7aed948a57a753573b5e311f72c899d14ac8950386a7ed4e6492a80255\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTravelerBriefView.swift.patch\": \"bc7728519ce25e25e4e7dbbe001507272b5e0e4a57fa923f149f0e761122e957\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTripLifecycleStore.swift.patch\": \"a2b363dc3316e30c4ef5f00526ca78d2e8b0fa4d5f93a453422f64e3b4db59df\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTripLifecycleView.swift.patch\": \"572ff466dc4aa6367143afd26cfb8d296ca4978195cc96f3e5390bc560125c21\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTripStore.swift.patch\": \"404224afdc5bb1daca3123ca9bf60e4834d573a8c0ba385b2615e13e6fe571cb\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTripSupportView.swift.patch\": \"4c9ab860950181cac5ff235b39eb5f3fa75a39c648b9fbf0123a78423d7cb663\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/NativeTurnDataStore.swift.patch\": \"16d90c8ab36643143d89f68f227e00812f0ced2cdf5b4f30977f5a70940640c6\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/final-observers.py.fragment\": \"6711b6e1ab41b42525a6933530662e34e8063bc6046284519b03ce3738975bb9\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/guard.py\": \"9d71e6eff0cc4743dc7e484c3beac32457eca8cd429f2f9b7e9b770785a59b21\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/original-observers.py.fragment\": \"c31158c7409c94a781c394b87e32bc4ebf043d9212f18c690a93786070599aab\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/own-source-pins.json\": \"395df37bbb5be3508d9e48f47cb6945faddbfb071213c29f342c6f347e6fdd72\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/pins.json\": \"1c08a3ada74f5c80ab667562d2de6ffbd5e20058dd40e45c3d5813f836160803\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/prepare.py\": \"a22a45c6c53ce63e88721350c02d284d85b96c1e6a037ef4ca9a963977ebff1b\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/project.pbxproj.patch\": \"65bb0ea55f47f0bc39258395dc83952197e539bbed3db005e9bce3abcff867cd\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/Candidates/session-additions.swift.fragment\": \"d366d420c54bd834430bc632239fdd2ae50955b4eb06aa852ea994d1e3a785c3\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataEvidence.swift\": \"c8f113788c59a633e8bc88f61884237a92f8483a956146513f533c573a8e1be4\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataModels.swift\": \"02823f2e81e0d3d3f5cede10075883b458fca977f7d1b90728e9d775c148d3ab\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataStore.swift\": \"f4befb27e16a7696bc5a472f53cbbb8cc8ae05dd3c3c7d3bd7c17ecfce30f7a5\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataVaultSources.swift\": \"d0d48d13447a063336d130ef72207ac2fc28d41e964d375780fac00c0fe6041a\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataView.swift\": \"e99cda51607b944da1a30ae0dd0f15d83c554418dd2123dc51d2d3999728efd4\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/SOURCE.md\": \"af89cbf72ad4e36a5adf50148acef4a721d15b9db56f1417f5558d91d5896e1e\",\n    \"ios/VisePanda/VisePanda/Features/JournalData/WIRE.md\": \"42cd8b6345b6e8d8eaa70757305f76bf0da23d69be15eaa29b15866a2b5dad58\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyDirectionsView.swift\": \"a1429c736926633283d78a01b2aa88da834a461bb7d34be6d88899b4e56d52a7\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyEntryContinuation.swift\": \"6c8f8e3e0ff34a2616f7c410660f6047412baf1f2acea360da68f9e85be71241\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyEntryView.swift\": \"8ebbde951024977f1dabbde74a354e4363fb53756f16f6cc04443d4865621af9\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyGoalReturnStore.swift\": \"8bf7c81b088741945fa58f8a9ace42b1f446d168267299d517dbb4758e4eef03\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyGoalReturnView.swift\": \"6109053ee0f823eb10b4834463c5877c0a2ce8671bc6db0cdf6155dc64deca2f\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyGoalReturnWire.swift\": \"3bbe57aa4f1fe8ce3f4aa0d9098bba19f58a1e90dd0c5a75078611cbbcaaf7d2\",\n    \"ios/VisePanda/VisePanda/Features/JourneyEntry/NativeJourneyMaterialsView.swift\": \"71cecb9d34d3f641cf4357e29d0af15f64d79144f7a206ee7d0d02d524048513\",\n    \"ios/VisePanda/VisePanda/Features/Journeys/NativeJourneyGoalIndexModels.swift\": \"d938a56552778876cb599f723adb757b85c32dd823947bc295ab6c0385741b6a\",\n    \"ios/VisePanda/VisePanda/Features/Journeys/NativeJourneyGoalIndexStore.swift\": \"887a200dfb20b9d4a566194c7e8c654ebc52b08002fe8a463d8b90e0330cc006\",\n    \"ios/VisePanda/VisePanda/Features/Journeys/NativeJourneysStore.swift\": \"cdcc94d7de712147132676a73253dc669f720f844f3ff32338f7787cb697b1ad\",\n    \"ios/VisePanda/VisePanda/Features/Journeys/NativeJourneysView.swift\": \"9211878ad1c2e5d4079f2ab77e1047eac9c6da801ca76b02618a7488caa109d0\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeFiveResultModels.swift\": \"be0041c5561e1dde067c3c5b61bc3dafee4f3e5f63135acd4043fc1794139c5a\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeFiveResultView.swift\": \"84177720744109dcc33268ab566a57e371339c837d39e379bf4410df82b6fbd9\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeKnowledgeModels.swift\": \"6cd5cb3257381da690020efa41f1c1f54b619329c0b396e7abc79eeb355e9f0c\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeKnowledgeStore.swift\": \"8081f7417cfaa53b6c0e29c8635c4710d6d3be44cebdcd64fb7145d1e763c93b\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeKnowledgeView.swift\": \"a1b00a22a0c02e3a11b2c71b17bb6ed5c68b6b5f1bf018c7dbaf25f125e9f0ad\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeLibrarySources.swift\": \"407dca760b061a4c9c7a38d720ef826d5b8cdb7171855f4a5198be1a83504d1f\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeProposalReferenceModels.swift\": \"6720712cc76064f39f9cb3bdc5cf3d3af0da6850c278f30f5e53c6ebf8cd48b0\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeProposalReferenceStore.swift\": \"616a5444d8857955cc51bfd77713ac656619101dff0d675460a12cb49335641c\",\n    \"ios/VisePanda/VisePanda/Features/Knowledge/NativeProposalReferenceView.swift\": \"e53615cf48a66dd3cb7c6884b6aea0ab131f978a533b06c73790b04c3db89c2a\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceCommand.swift\": \"ac988afabcb55a1bbf034a544b49fcec90b4388e06d5c95b3c919d4e6aed994e\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceConsumer.swift\": \"fa57f24e7d22bfa7dd392117b53a13ecd20430c6544ad720078ebcc2614ab82a\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceCopy.swift\": \"eeaa5e05e4ad327257daa77183b9f33428e2c3fac3c179326c3ce0a98ef78513\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceExportFile.swift\": \"604340171c4dbe7bb446a2a7fd2e94f8cabe89f8b7f47f5b6b86bbe96bcdf2f1\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceJournal.swift\": \"95916983bca78c150df7097670b01a31a6efe1f63ffd8067dcbe6949f51f424f\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceLifetime.swift\": \"4b77032bae8a9fc33192049639b33b8496945d0ba2a2d383d79681c29e6ef4f4\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceModels.swift\": \"51b6d91e1568607952b1dbbea3a3763cb61d264cd4775ab72c805bef3d35214b\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceProtocol.swift\": \"3fcbd188d3735da1afa245b627d789953a0fd3b4307570226aede62493360d0a\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceRows.swift\": \"2436eab3e9331a3224b489f8947f3f6f042ac281b1a1fee21e1895fbdd0a525b\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceStore.swift\": \"a3abff885455ba19d147542ee9c35be1acb09abd3a16fa6873d74cc464a333c5\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceTrips.swift\": \"d3cce157fbb97e0467c024c33d3398d05b335a1d73aac054f9d39241b036d278\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/NativeMaterialReferenceView.swift\": \"825a31f836f2f3f3a8727d4554eefa4e96283010403787c74f2eebe5e6aac424\",\n    \"ios/VisePanda/VisePanda/Features/MaterialReferenceData/WIRE.md\": \"476d55ae6874d96509219f59acafe3f3d427a44c3fa7a1364a3d41e581ab8413\",\n    \"ios/VisePanda/VisePanda/Features/NativeExperienceSamples/NativeExperienceSampleHub.swift\": \"d5ab22d2db7ba271eaec1641dff757afcebfdae291efc9628d355d4ec5b2e798\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataCommand.swift\": \"e1ee7a11c4c8d3f57b4929d79d3ba4c6ff745469cc426fedb4e58b595f4fdbd3\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataConsumer.swift\": \"a5263df03685819479445f430e3fea25a67aa2d9a710a18f97ee12f37d9215fb\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataCopy.swift\": \"82b5fb38523e637ec5daca8b002e2e9bb92084667f61e5f8040df46be6c0e506\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataExportFile.swift\": \"279db6fe35aeb23204b7c3ac3590f9d4891494c87eac9da4db3f847d6e6fc83b\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataJournal.swift\": \"8fa627fdfc416284e6fb8f2963a6fce2a30f9c60f6e8a28571f64cfd2e0601aa\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataLifetime.swift\": \"28886c2fd84756b4acc0db938f3738b80f2d3fed01e4b2db2ecca772767600c4\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataModels.swift\": \"08288c07321cbcdeb552f637b01b197365b797c16747d87f1ac155e5b33f6963\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataProtocol.swift\": \"9d071fc45dcd573c87ac783183b777d391301d6414de10a3ada9612d65184a23\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataRows.swift\": \"5cb7274b59ff99dff7879a3f1fc0ca3612ef74e460f7e4e5e426253bc98b6338\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataStore.swift\": \"e7e597a61bbbb720a18dc3b7ff7f1abaaf41f4d7f14fe3ac6d0877788c01ade2\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/NativeNotificationDataView.swift\": \"e2f08fb634ea0878fbd5bb117c4db58d9e4acdcf6e43dc153c77c0675467c628\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/SharedNative.patch\": \"a8d1041abb14f75cd8a238c5a81e372aa9a86ca61f28a7a8bf57e83adc6d14b2\",\n    \"ios/VisePanda/VisePanda/Features/NotificationData/WIRE.md\": \"9e4a8f8a0603cb265adf97dd2ded52fa87b0ecb387de58ace6a1883fa63e6958\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNoticeCommand.swift\": \"e8c992348d13510770ee07e368bb38a2458b6eede568383fb946549723d05fd7\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNoticeStore.swift\": \"3a7eb5cba91339152266fff8e9f3e899514a17db7d8b706446a316afbe6d3199\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNoticeView.swift\": \"330d5517742b6c352d39ded53e03810dd60f5ad5509de7de63017f553b393501\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationCoordinator.swift\": \"e6f88ee63fca27fe769b3a6abfdf56e7f2902752c2fca6e79ab0bd14a6847f64\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationJournal.swift\": \"d2f570f4c72023b2d35fd408f11dd3ac82b50ffd51354e47a1360132405bca90\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationModels.swift\": \"7baddc6168fc115a14f36722cd42d73b0f9504cfbde79bb64b272d89823a03d2\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationPermission.swift\": \"b76468741580e097051e69c226a92bafbad6ff9bb582599d178484d0517ac1c5\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationResolution.swift\": \"c1702bd30a5c812ccd90dab4f4fe0c89245efa3ba0c78a6bb15d50f1e2832ec1\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationReturnView.swift\": \"912e2cd30cc011f92acb4302d0de5fb121d93ae992a030476317dfa27d4da49b\",\n    \"ios/VisePanda/VisePanda/Features/Notifications/NativeNotificationSystem.swift\": \"8731585160c49a2115840aa7552efde26e14baed067eb691030f2a636768cf82\",\n    \"ios/VisePanda/VisePanda/Features/OfflineData/NativeOfflineDataModels.swift\": \"d9f8f409dca290de266cdd3aaf2f19890a6a442b7c9e4740ab4dc143626f745c\",\n    \"ios/VisePanda/VisePanda/Features/OfflineData/NativeOfflineDataStore.swift\": \"dc1bcbee89b81a0353fa0e58c6e20f6bef2a93298fcd3cdc5f0af1c16151814c\",\n    \"ios/VisePanda/VisePanda/Features/OfflineData/NativeOfflineDataView.swift\": \"2a3fc4c357c01a7edc3f6d81a795fc39846eef43494e154e1b797e2221345e67\",\n    \"ios/VisePanda/VisePanda/Features/OfflineData/WIRE.md\": \"52ea61c59e7fe1af0d225e9ff1c57ee782507d0fd48f3aabdb905dfc0ce3cf57\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFDocument.swift\": \"5e92d5b3b197c2ac72195d621d152f4d8326319c324bc643f472b207064b8ae8\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFInbox.swift\": \"30689ebfd17a12ca468940e37eef8e7e7f31e12db44e22a026313151b27c55b3\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFIntakeStore.swift\": \"956a79a7fcd38be71f6bca8875f2ee43ab2f2f1ed4b438ab77ece32e6dd25b06\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFIntakeView.swift\": \"6447038360d2089759685e68a22a7c79cdb687a6fe5b37204593ab7d970e5f8d\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFJournal.swift\": \"dfc241bc3b771538721e5519779a859312596bd011d3ab78d7875fbb85aec888\",\n    \"ios/VisePanda/VisePanda/Features/PDFIntake/NativePDFWire.swift\": \"3b5f6df9ce59d2183fb9b3c08c707eae1f074dd52029b8baa88fe56c1fa3befa\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionCancelled.swift\": \"a944b41dc20187595b520072e692b79a4edbc577a88f63ca0eff855fa669debc\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionIdentity.swift\": \"baeaa45ed51a2311a7c31d2585d1a5ff37480724723d5ed503bf0aca46bc7e74\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionJournal.swift\": \"55e2bdc666bfdf41256f49f34cae4df869a3b0937c667975988b283a21f1b291\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionReview.swift\": \"7fe8c24a1f1bef42978f06893c0a9bc9f5ef8a7c0190175760043863879d5d35\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionStore.swift\": \"2e7b85dfe8d359ed3f461651cc60e958d11ac62f42c9b5432ddfa1cbd5480cf5\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionTrips.swift\": \"947f0334c7274399b0d464bde93ad1d9a15297a4072ea1e970b4018180804f0d\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionWire.swift\": \"095cce08a778beffe21302c9931893504a00c96598ad78ffab33933e4fe09913\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\": \"a4bd5773baaf42aaf8042c5edd10f8a0958770e70c2f06a823b3765cf2cd6c64\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativeSavedPlaceActions.swift\": \"fd3013cb9d64c1f6baa5f3660ac65ad5eeb1ef05f90e0e4fa4f80ecce08025b0\",\n    \"ios/VisePanda/VisePanda/Features/PlaceActions/NativeSavedPlaceActionsView.swift\": \"efbf51ff554f7f372d625a5f21a27a4353e14434ee4702cbc044192503066126\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideCapturePanel.swift\": \"e3c24eb827aa008d939e7188c3b6bb9fca0b03e796d1a2f0af5508eb7b29bda9\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideContextPicker.swift\": \"84303143fed15b99bcb52f9d00f205d935b8ff05040b8128bb2990f5f0524883\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideFollowUpStore.swift\": \"50f43ff92df614fe9fb15786123693bfea15ab2a7edf9e3bd2e9dd9e465ad76c\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideModels.swift\": \"e937c164d72cc574f48e4739c331d64b5c7854442ec07996d99a34f3628fd071\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuidePending.swift\": \"aef1cb94544c6444515d0b436efea81a79492395df653d0dd4be01182c7b9576\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideProgress.swift\": \"cd41cf2dfeefdcb50a02f74786675522a8d76d568b7bf3abd586b85b1e4af9c0\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideSelection.swift\": \"17e93b59afcd1f6ee3863fca208c99437b222fe20ae9ac77f2f2c9914f50dac2\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideStore.swift\": \"a69f94654a53dc9e9d0601503ae47ba37069f46b2e1426c7a11c598b38486864\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/NativePlaceGuideView.swift\": \"d8a4d4cbbf656c321df550aebf8bcb0be351d8352b726b2ba8bf9ec6ae6b44b0\",\n    \"ios/VisePanda/VisePanda/Features/PlaceGuide/WIRE.md\": \"8fd52a424bc1d2f41f9bf1f77fe20b991ce4e821a498a68e95372f0aa60900a4\",\n    \"ios/VisePanda/VisePanda/Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskCapture.swift\": \"61af360f4aa5767f8f66199db1d231fb98f708331392be68796abf0c8f635d58\",\n    \"ios/VisePanda/VisePanda/Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskPending.swift\": \"9df560fc2d82168e56e30b12ee34442d11c29155f4d02bf1bd58118e87ce27fa\",\n    \"ios/VisePanda/VisePanda/Features/Profile/MemoryDeletion/NativeMemoryDeletionModels.swift\": \"e279dc285006cf1a2c94f98d472e8b554437acd4197a72ab10ffb37027205aed\",\n    \"ios/VisePanda/VisePanda/Features/Profile/MemoryDeletion/NativeMemoryDeletionStore.swift\": \"6540515bcc5dd0fbb26e8c48e8f04f4cab156d3fb2684b4a4e99c414a363496f\",\n    \"ios/VisePanda/VisePanda/Features/Profile/MemoryDeletion/NativeMemoryDeletionView.swift\": \"71276c04b409d9b992238b9343e5963221bfaf720b91ae86b8ef6c0fcaced822\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeCoreExportStore.swift\": \"34febf9d3c844c7edbe3cc6e5f0ccdc6a3b8d55b61b31cc86782b01747e73455\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeCoreExportView.swift\": \"945886c810f40b753b3ce4c96ccc4311a53aef0c89a27864b12aa84bc1db8564\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeDeviceMaterialDeleteStore.swift\": \"4d403a4ba2225aa28509b92467add5db95e66b9ea297aafc9e2d1148dc883c3f\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeDeviceMaterialDeleteView.swift\": \"d027194cecb33a22271cbadbc8dfd67546218764a9d0b555e2db673c24f1bb8f\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeDeviceMaterials.swift\": \"252582137bff5db966263296fb8aae81ad787712806736b5837da0c4d001cecb\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeMemoryPreferences.swift\": \"bc807ff48949955173146ad468ef287ba76879df98fc32134c64cc586e838d2e\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeServiceCaseView.swift\": \"fcefed3aa5c7298a1d1b93cb47625a5ee8e07b6a9357fc31f5c3e660c578928e\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeTravelPace.swift\": \"c6897136cc294ef5a0e57f7e62f2caebe4da0861126f945efb3adb7e496f56b2\",\n    \"ios/VisePanda/VisePanda/Features/Profile/NativeTravelPaceView.swift\": \"a5bf6aa928fffecd33a0a73eb342c360e054e5f91e1ab0ca930902f6e8c8b46b\",\n    \"ios/VisePanda/VisePanda/Features/Profile/ProfileView.swift\": \"b900ae2ea9c940c35c4ff25b5db478713a5590425195c65eb316dc63bf03db66\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataCommand.swift\": \"b25b50e20d98520983c12fa972e06f7cc813160d6a35c876eca38a2444d46bd8\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataConsumer.swift\": \"70eead293d03df5abe15d60c4e2cb43b4baed7b5320d1215f7a0682cc503432b\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataCopy.swift\": \"ac032f130f054bc85e563b54af26f55b5dded91c1f3b9a6b5c52b3dcca2fe8dd\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataJournal.swift\": \"da8d6b11f3dd01f08e5f8a19e947bfe7bc6c1e9f3e7d096a539449ad67199d0c\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataLifetime.swift\": \"e9380e3faa7fa4346b93e111ad0c887ad830d2326ce5985a4500d1e92049b67c\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataModels.swift\": \"31a31b0b28c414cf745e37acdbb22c6e44334e80102880086a08d6d73b9567d3\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataProjectionFence.swift\": \"111d9140911750eb97a17f72c464c84c80b32100f4180ff7c09540449e003e99\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataProtocol.swift\": \"8b06039b86125ba28cce2f7fcd22bea8e2b4fa779c188b1a349deb7469637b68\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataReceiptFile.swift\": \"3e40d391f6d6dfb5667787c88112657793d9e36ae71780984675bb265363b91c\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataStore.swift\": \"f5603b3e8f5279791afaa720d3841d28a611dea9c18e87a92b5dfe7baad0f39d\",\n    \"ios/VisePanda/VisePanda/Features/ProfileData/NativeProfileDataView.swift\": \"8b6b86b879a8d0b6f5699e2c217f2c9af44790391f973d81a9e5d5a877c2d083\",\n    \"ios/VisePanda/VisePanda/Features/Readiness/NativeReadinessActionDestination.swift\": \"054b36be3ce28527b655710fcacbbc69a5940b2fe818a1895baab1f7d6463bc8\",\n    \"ios/VisePanda/VisePanda/Features/Readiness/NativeReadinessActionsModels.swift\": \"450064c0aca27691ae9582dbecef8095ee9462c2727ce01401afd9758670c657\",\n    \"ios/VisePanda/VisePanda/Features/Readiness/NativeReadinessActionsStore.swift\": \"637e2f1cfed0ee371998573c41dd04f886f24702be6fd14d2f053e7f0d2ea674\",\n    \"ios/VisePanda/VisePanda/Features/Readiness/NativeReadinessView.swift\": \"c147526a02e1eff9856cbc9a6b4c90a7019cf663266b62d3b8d3f020d4435662\",\n    \"ios/VisePanda/VisePanda/Features/Recovery/NativeRecoveryJournal.swift\": \"0a47c9b539a54b62126baf153ebf6d6375cf031a37a305d6010c0431423e7bbd\",\n    \"ios/VisePanda/VisePanda/Features/Recovery/NativeRecoveryModels.swift\": \"732ce6db6c240ec03b2c3bc6a0ac5eb6a56615d5be204b73a0601c38db1e0afc\",\n    \"ios/VisePanda/VisePanda/Features/Recovery/NativeRecoveryStore.swift\": \"774d49fc6f7da26bd6d31bcf7ee88456a9f948afcbb55b75e6487e2b3926e21a\",\n    \"ios/VisePanda/VisePanda/Features/Recovery/NativeRecoveryView.swift\": \"627f5b8046d6a7f981b389f1e51d1d0624cc5f845ff4f27eea79eab2adf36fe7\",\n    \"ios/VisePanda/VisePanda/Features/Reservations/NativeReservationJournal.swift\": \"769f93a7c8401c7132143449e809af3417e31b8848323dd2f8b7fbf922f192d4\",\n    \"ios/VisePanda/VisePanda/Features/Reservations/NativeReservationMaterialView.swift\": \"1692ba435f3622e608c71c776f567f16d174907b02245b70f0000876b664316b\",\n    \"ios/VisePanda/VisePanda/Features/Reservations/NativeReservationModels.swift\": \"f78fc180db365b9860cfc71413d5c0fbaf75e4ac233b4341d119fa2997fba2bc\",\n    \"ios/VisePanda/VisePanda/Features/Reservations/NativeReservationStore.swift\": \"9da5ce8f4a74c0088c92c32ffed34c73048392eb6ddc1bc6dc10c2385cacf705\",\n    \"ios/VisePanda/VisePanda/Features/Reservations/NativeReservationsView.swift\": \"a79bf87d6fdde4f3944da3580af743c69577c3e4d83118d6af1dfc75c7a21a3f\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataCommand.swift\": \"2008f33ae68320158ef8560eb64a98f5571231efd3340fb453cc6a4ac8127821\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataConsumer.swift\": \"ea43cad4e5872f805da47f2739121f52fbbf3b3fdd6d1fd81b2edebef4dcede5\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataCopy.swift\": \"0f283c53938b7abcc692e425b2a5d6d2510d4d28aec61cca65a0c4213d525c3e\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataJournal.swift\": \"43953e3ae80a2f4efee2d1ac144982b1d3708bd39cc7dd65ac641c1f8cf519b1\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataLifetime.swift\": \"8bf6fca03bb664901162b8768a125ea1e41ff5312770be122e88bef818b70b26\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataModels.swift\": \"ce523516d198d78d78662afb69d2d63915f50b728c52b2ec23a91592157cfe6f\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataProjectionFence.swift\": \"d8f0b75963942f51b3edc1ec08acb4221750bbc64ccd18c08d4d87c3862ad558\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataProtocol.swift\": \"54059258275e59c181481eed3a076e3d99257fd051988fe5204917d60b63d143\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataReceiptFile.swift\": \"6c1e2b9a94fcf6d3c6fcfe9bc4c2553a545d0d53f5d465bb8b0041b1e3586fe0\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataStore.swift\": \"b3982269d707b9a0f0cc23232dc5a7d74933c4b2bbd19b87b9b026a0008d001a\",\n    \"ios/VisePanda/VisePanda/Features/ResultData/NativeResultDataView.swift\": \"954422c903b6e10c528284d3cb09e08731d63ff4dd76690bde0f73e2d8636c7d\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripCandidates.swift\": \"311239a0b955a4856837112f7908f38008d7294c8ef46719cf8224a030bb4e01\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripCommand.swift\": \"003e13bc9706dedb373c70142ad82fc617397fa2bf4bc2ec5ce715e59e633ece\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripContext.swift\": \"ca926c7d37abd9ccac2d588d7c0d6b81a8e660f7ecd76c9c0e1ca1d05fca0548\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditSheet.swift\": \"a7427cae5b58ec322afd77ead3e7e96ef2875dc4f476252c2f0191c673539dd5\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripEditStore.swift\": \"ae71946bf18cd9157a026cab6b19568d8f78e72eb75938f7dd0646f67533a690\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripJournal.swift\": \"030628d2dedc4084413837cfc23b4de5522e34febd1b676fee38a5065ea6d059\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripProposal.swift\": \"a261398b747e32bc40071345daa1ef04f52b9577f3c348b09145165bbf407a3b\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripReceipt.swift\": \"a9ef418b1ac9c83223a89ed0b2dfdc7f53c1017862063193d7c458fb66811ad0\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripRecoverySheet.swift\": \"f60e82cdb82b5f86097d2df4df711dd8bc50a17a5ee3c3a0edebf80062b2c531\",\n    \"ios/VisePanda/VisePanda/Features/ScopedTripEdit/NativeScopedTripSelection.swift\": \"e5657cf7c0401dbc3ae42f579f0cceddcbafc561a3b412f27bbb8fa65da3ce5d\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceDataBundle.swift\": \"dcb768363f3a18e51c167ad59d4bf918a318eba236810a7991a0b1765a4c1dc9\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceExportFile.swift\": \"9512ec9762e544a697537eb38c1fb4e20a7cf56f805a48737ec7b9be76a5d44c\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceExportShare.swift\": \"3e266e485951133ab55af1e55892e45f222965a8ea492bbf07e1539c5e147b89\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationCommand.swift\": \"31a7822f2933bd0543a7224a6ffd0ec60d93fb5e4dc308c499107ae35751f600\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationJournal.swift\": \"bbef57d3a8b5a2b6d43930a3612fbe8221b76c45fd9957f1b9bae55ba30e51f2\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationModels.swift\": \"7343c1ee414f17762f7754821b940b434cf45408ee40764bb2d68fd8dadf1ceb\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationStatus.swift\": \"68e1dd1165542b8bbdc31e724f9133528df8b5d56681f07b61d010e2c991ba9c\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationStore.swift\": \"00ebf1e6e4bad70bcae724e623bc37d883879fdd6e1a1e6c54bd3d54b7251691\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationWire.swift\": \"0915bc5433fd6b39f393d80af47e07cee8283dc641e154a8838267c9ddafaf24\",\n    \"ios/VisePanda/VisePanda/Features/ServiceOperations/NativeServiceOperationsView.swift\": \"75b8389c6b62afce78961ac61d484e2168a77304a5919d1260269f689b16d376\",\n    \"ios/VisePanda/VisePanda/Features/Today/NativeOfflineReadPermit.swift\": \"f118fdd8db8ae2e5ba9c5f947ebc5ea626be4a8cdca3da3294d22265a662454e\",\n    \"ios/VisePanda/VisePanda/Features/Today/NativeOfflineTodayView.swift\": \"90ec91a1c45fd102db2b0aca8d8fe6ce000b846ff77d7c803653882d2bffb346\",\n    \"ios/VisePanda/VisePanda/Features/Today/NativeOfflineTripStore.swift\": \"954de70b68e9b3195118b5ff4a8a53a5f125baf8cd0305cb384dd883a2020a5d\",\n    \"ios/VisePanda/VisePanda/Features/Today/TodayView.swift\": \"6c8f0b64093342de1942f93a8e6d966f739641a2f137af57659230a65960fb25\",\n    \"ios/VisePanda/VisePanda/Features/TrafficObservation/NativeTrafficModels.swift\": \"e0c35f0f120c773aa80424fe13d0d9935a56e7519becf0be8a818bbc4d7f2514\",\n    \"ios/VisePanda/VisePanda/Features/TrafficObservation/NativeTrafficStore.swift\": \"9b7f49989735414dbf0a101648421f4a86e04620d504d8b8236d996e6796eac3\",\n    \"ios/VisePanda/VisePanda/Features/Translation/NativeTranslationStore.swift\": \"f47a96aef5a0cb0a1a253768e063b71d89a693b8572bd336f85e88dfdb320b23\",\n    \"ios/VisePanda/VisePanda/Features/Translation/NativeTranslationView.swift\": \"e6308d4a49cad55a54002c4e04f138a2cf55d48397e4466c38ee570d7d0c932e\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsContent.swift\": \"15ed623a4cb9993f9a75e6fefafe3e7190700d30763e4cb62d194fc95113dd03\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsEditing.swift\": \"e92f292a0ab91f422c91d286ea712bc5d4a98ed56d9f7b84c670dfea3a4c34b4\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsEditor.swift\": \"7e8db096f89e42aa5ccf13a03e229cc03c9ef8d20d93826c1494b0ee26f3f7e8\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsIntakeForm.swift\": \"4e194322ba5597723dde98a42aa2d738fa761c0a4577de92ce2cc3591ee0b865\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsIntakeStore.swift\": \"adccffcaa14e2d09237dcd5a866379129826850a425df724a607b921348826b5\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsResultView.swift\": \"ade6fb53a15215d91974d328f4a5c3ea9ab90f170a8c95129b654ca5a8e45183\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsSheet.swift\": \"20c14770c2281474843b243821b0ddb8fe388b9cc82cc46c52ba161d06db96e3\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsStore.swift\": \"bb8420202d550ac29794394dff5c0b6fa7d8388b6d8d61080bbae47bcd43ad91\",\n    \"ios/VisePanda/VisePanda/Features/TravelDirections/NativeTravelDirectionsWire.swift\": \"b2cedb742f29f65f6a5b07c24baef861789da6d6baddbec8281a102321437c16\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefCommand.swift\": \"05b7bddeabd840b82e0f9c0c9d1ce2facec9020c0bf0e82783feec8734fa39ae\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefExport.swift\": \"a1862da73c5ee698298d47c21e087e697fac8e8867ecf51256a23560b0fc16cf\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefFieldView.swift\": \"def825dee21bfc611dec49e3e457b5a1083fb8f1e31623ffe5e43b5da90eee80\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefJournal.swift\": \"28cc86e369851ce802eb3b3fcc9dd794b0b12459c8d87ceb343db39fae5ea693\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefModels.swift\": \"b1393bf1d343808986938f1caefcb1ff3099ed5ade23c1dbbabe5a4a48d9d6c0\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefSelection.swift\": \"5ce30e34c0161b059fa61e656036be3b0406ee9df9ff0efeddaa46aa005087d4\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefSources.swift\": \"38949885fcee580adb7ccec6ee59da1f8ee1818b930ec44750c06c2b37021be5\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefStore.swift\": \"0fa999dcbb4ae5078ecbbd7a707548abf5546a4d217d73fa8251da8412abf57b\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefView.swift\": \"14b159833ef44ede0e24b085577643d058b9915dde6d47ed0eb38a9a6f85e1f7\",\n    \"ios/VisePanda/VisePanda/Features/TravelerBrief/NativeTravelerBriefWire.swift\": \"520606b74846060eef6bdaad4ff4ae39cf877dc95d671b8781e06f97304493cb\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Feasibility/NativePlanFeasibilityModels.swift\": \"9aefc5c07572d0fe3a9695a28643309464d8f58b4de77e1249280c1fc34ea378\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Feasibility/NativePlanFeasibilityStore.swift\": \"e95850f74d2ba4f802d2cc80df66ed473fb50c16db948e3f72b98107f71b1860\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Feasibility/NativePlanFeasibilityView.swift\": \"eb6dbe657c22a65a10991cda311e8b3eb618b2aae62d019e5bcf5ce1986a5e14\",\n    \"ios/VisePanda/VisePanda/Features/Trip/LinkedDeletion/NativeLinkedTripDeletionModels.swift\": \"0ef0f4bae1407e13c2def774a1378e32ae8a9216d192ad0017528fa80af72c20\",\n    \"ios/VisePanda/VisePanda/Features/Trip/LinkedDeletion/NativeLinkedTripDeletionStore.swift\": \"874dd81d336d8961ba416ad084c8c6ecb1275e767aea6151bbe39e2922d9264d\",\n    \"ios/VisePanda/VisePanda/Features/Trip/LinkedDeletion/NativeLinkedTripDeletionView.swift\": \"600f55e9acddf1674722cdcb892d5033a1e8f48a40f462a5bda1bf236c558779\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeScreenshotInbox.swift\": \"34b059e1a39f87c9613f794e86545c38b1a4b4ba23238797d84de086b230d82a\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeScreenshotReviewView.swift\": \"f9cd41547ff4233759fdea79f1b97e01afbfc71cef784066ae99704883d1da35\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeScreenshotTripDraft.swift\": \"ee3591a44069e46dc25089f46a654ecf3afda4573802f43725820b4891e58683\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTravelRemindersView.swift\": \"7229fe6fd04d509119a13fc2ef6e553ac84a6f737c85131bb72d9adf0f24bde0\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTripModels.swift\": \"2d5543a25254a096db4f1dfde7ba4d20f4bcbc9446a268b646df789dfc509dd5\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTripShare.swift\": \"c4e1a883a1a4b83e42e62b6abc49125c8cf2cd491bda9703e7045d40004f33db\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTripShareView.swift\": \"00d73e1d5276abc74f326bb9a2697f47f2fd5548019663049f41002d3e4a2505\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTripStore.swift\": \"898807a74fcfd892e00799958f0e3b7c08792d21a9570fed01112f4c87dc266d\",\n    \"ios/VisePanda/VisePanda/Features/Trip/NativeTripView.swift\": \"8b8c897d6dd31a59c0a47af81c495b737ac7af429535b34b0488aca1181db5d7\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Support/NativeTripSupportModels.swift\": \"e3b41662a6247efb0b0ad3f047aea6af5e6844f73b85037aebb2068b0b440fcd\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Support/NativeTripSupportStore.swift\": \"f35593fdbb290906e3f3e05466c22c1e37b2e7d1a13eac830b9eda6c7c3d34e5\",\n    \"ios/VisePanda/VisePanda/Features/Trip/Support/NativeTripSupportView.swift\": \"00273612a15e1687f1d540b8d75e1047240dea22280801dba2edac4920f54684\",\n    \"ios/VisePanda/VisePanda/Features/Trip/TripView.swift\": \"3abd90951d3427de5dfccb056ed5ceed30f901717a2428dc4ab2550e3e06e436\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleArchiveSheet.swift\": \"94aa839c327242c5b4658f9ea293889210ceedd8169e930b513179e8834e8067\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleCommand.swift\": \"c9ca6f4ee763ef7059e09c8b2a118ede8219632bcdc7965dbb517577322b0eba\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleJournal.swift\": \"9691d04db85493db9920b2af3e8c156ee68a47fe293011b48af7f674f171d9ee\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleModels.swift\": \"c216bc534ba0383061d13bafbb32fcca7ae27eef72e974a043079f70c0a894d5\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleReply.swift\": \"5546030227109c219be12734758c43b9ec9727e7457e847d4ced9229d8fcc156\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleStore.swift\": \"3ad48d3131ef25a06b3751b0f736a4b1f29501c349d3206f3c71f9a0558638b7\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripLifecycleView.swift\": \"83f02c0cc24369c644fef4efa651e7b08e2ef8b653be7cc65eb5259afed8beb7\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripPreferencePicker.swift\": \"197e3a77f503da05b7b097eaac6933e19673d147e1028cf74fd5a1bd1c131eb7\",\n    \"ios/VisePanda/VisePanda/Features/TripLifecycle/NativeTripPreferenceReview.swift\": \"22d2dadf40a2928c63720859a909c6bfcdd067c824ba1db83e02e63f8d5226aa\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/LegacyAskRead.patch\": \"bd8f2478b34d442521611e98da3c9fc863da320dde2e6aee4df4812154bcc834\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataCommand.swift\": \"ce7df1f1785f8f7a662534a087303e91ce1ed8af307763ed6a5930e608549d35\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataConsumer.swift\": \"60bb328d55d0765177b35a02557a9489ef736c38d6fd211ba29ec5867c964312\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataCopy.swift\": \"914dcfc8a148f8bd9ca81316192421a2a7867f2f6b49f77ba897161ebd39ae32\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataJournal.swift\": \"ae4053baf0374006bd01295b35ac97cc38cd86fd4b046657519a9bef286e46fd\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataLifetime.swift\": \"73bd9d99e2cb244a33f454f71f0d3919a509cd89073f911260dd70e933fe781c\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataModels.swift\": \"6f72a4a4a02486807079b36ddd8eff913d0ad0391184f5df2f7d173e3e57932d\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataProjectionFence.swift\": \"e2786f456c938ac873138eccab289ba8878ab98289a47d63dfb3ee22f14ed5ef\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataProtocol.swift\": \"8c9e9b6540700be08a9d695c395e46a9f4c0d9efed7fad8efee0b0181a7b4c40\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataReceiptFile.swift\": \"5a3d45e596bab48bfb0a4efb4b2bef028756f6a2b84f02d97e25ca71c77e2698\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataStore.swift\": \"2ce8b7cc4d701383dda65870dd80e8f5b687dd0e0fcd7d3dfa5d79b815fb1416\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/NativeTurnDataView.swift\": \"125f25cee2b6c220a496ac8a5bf8471bc77b7d05e7f3016d9ee96e4eccf77b78\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/SharedNative.patch\": \"c8886e60d9c7381686f91810153a5e3382efa2acfbb7bd861db95a4f56d166a8\",\n    \"ios/VisePanda/VisePanda/Features/TurnData/export-native-fixtures.mjs\": \"0fa72404a5aa82c44ce8b7b55dfdf5eb6a6d494ce05ce80a7b8b0c5bff341df6\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeSystemVoiceAudioDriver.swift\": \"f868ab487658233783b5d607c2dc10563d8ff04f92d594bca56fd38fa9d965c0\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeVoiceAudioController.swift\": \"8f6d7503c178be203f33d44d8c66c585b98488c7519554edd3342b32cb35c526\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeVoiceAudioFiles.swift\": \"bd4b910bdc3bd2209b3382e6c605554d5818b32a8b09dfaa836573993f9fa1a5\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeVoiceAudioState.swift\": \"e16866c43f4f8ba439035d6162f6940cf1b88dee6df327bdb91f810c342b424d\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeVoicePCM.swift\": \"bc49d0f8ab900c60bf910f2a4347e162cc5b56cfc2dbb9348c09e6c2ae79d7aa\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceAudioPanels.swift\": \"a7e1d9c79fff56e4341bef6939c7d849c6bd36f725314eb1277667f4186861b0\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationStore.swift\": \"bb6113fa48ce4ae01b3b5522dcf18505d7ad37a863e9d1f911b5606c96dcc305\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationView.swift\": \"74decf484ef1ffebcf100f6268e659cb34472877519bdb70d23300fcfbe71282\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/STATUS.md\": \"a897f1c49548590a4632d096fa91a7e0c41204989604468710a94ae14945e8e4\",\n    \"ios/VisePanda/VisePanda/Features/VoiceTranslation/WIRE.md\": \"254b4baa264f7eca7a62d87f224053d93af79fc3dfdb5adf68d9e523fd060871\",\n    \"ios/VisePanda/VisePanda/NativeEnvironment.plist\": \"9fe856c8729ab402f6740fbf6b4f12e17432ca9ad4aff47c611495481eec32dd\",\n    \"ios/VisePanda/VisePanda/Navigation/AppRoute.swift\": \"04d803e748f104ef4513d3d1076fa05a3218968d97ea5bb8b58f4a4e3f2db9a5\",\n    \"ios/VisePanda/VisePanda/Navigation/AppTab.swift\": \"853fa5f5708785f55fb865ef96514a21532319c257268b9c1e39bfca6c350053\",\n    \"ios/VisePanda/VisePanda/Navigation/Capability.swift\": \"796eb3a8ded5868e4a6062e453048eadb799e63f50e18d8e3e2509440ae20a08\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png\": \"68125fe9bd2d5669dc521381f4079e2b1e9b5df2500c559ee5544e3e225602d9\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json\": \"852920cb36e95beb53771138a4b8195a16fcce1cc31250632f246081cc638f9a\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/BrandWordmark.imageset/BrandWordmark.png\": \"de8a756a156e57ad8e9993051827dcd8328c2de4ef8d5601e61d6310ce7486a2\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/BrandWordmark.imageset/Contents.json\": \"4a0ec5a37bd973ad69ced4d05e65b35a41bdfb54591790d65eba19197c3fcb7f\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/Contents.json\": \"f5fb0e1f3a8142892ed092efb5955c1c2cc537003a89ad7bbdb9dade7fe8985f\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/MuseChatAvatarOriginal.imageset/Contents.json\": \"56e9e5fe44b8edc2064fed7f10a140a962abcd0b502396f7eb1a24511e21cbe1\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/MuseChatAvatarOriginal.imageset/IMG_4852.jpeg\": \"a2bfdd463df05335d052c4485bfa613a422ef67a575aaacb2b886efd436cf29e\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/PandaMark.imageset/Contents.json\": \"6e511376a537295b40796cb31b6964d164b254414dc61f2d407ef80f15a6dbaa\",\n    \"ios/VisePanda/VisePanda/Resources/Assets.xcassets/PandaMark.imageset/PandaMark.png\": \"5f6977b17d95701f7368b9eec518770f276a012262f82a599c06d51c919ba94d\",\n    \"ios/VisePanda/VisePanda/Resources/InfoPlist.xcstrings\": \"ab85ce0aa3a7cea290da4a709dd480147ab847839adb34d9b0b11a4d21c8ab49\",\n    \"ios/VisePanda/VisePanda/Resources/Localizable.xcstrings\": \"311e3d838d7d3732fd09f490aa10ed7feacc51011d12a2424ddac3e9655e4095\",\n    \"ios/VisePanda/VisePanda/Resources/PrivacyInfo.xcprivacy\": \"f625ea093e2ffdde3fd3020a9da282bfbd92a02720061fd87584bfa6876567df\",\n    \"tests/contract/ios003-place-ui/canonical/NativeCanonicalPlaceAskTests.swift\": \"e319feebbd5c6ae7feb3e0a4f9af15cd3efda25ab9974d5dc88195c08af43df0\",\n    \"tests/contract/ios003-place-ui/canonical/probe.swift\": \"7f48ca4f335739496e965f70c48d9a18733d6b09654d44b400e3eb25eba7aa9a\",\n    \"tests/contract/ios003-place-ui/canonical/run.py\": \"831d6f13c7374ac957a9f675d4bb8d8b949b2c29df6ef2980435f97710a406ac\",\n    \"tests/contract/ios003-place-ui/canonical/sql-history-positive.json\": \"5923ce1e4e5a3dc9b56cd98a210c35ed82093df3d9bb5475cbf99a9504fef2ad\",\n    \"tests/contract/ios003-place-ui/canonical/sql-pending-unavailable-history.json\": \"9ec1703a4fb904ea8930590792385264699691cfa5245766eda1df61921d8d17\",\n    \"tests/contract/ios003-place-ui/canonical/sql-wire-positive.json\": \"e23156193df15eade60a939344e7f796452074edeb077633c4a390222ad7bf8c\"\n  },\n  \"actualProductSource\": true,\n  \"result\": \"TEST SUCCEEDED; 9/9 SwiftTesting PASS; App/test build passed\",\n  \"testDurationSeconds\": 2.399,\n  \"rawLogSHA256\": \"231196cd39cc3a7b506ccb6b75afdf360a020503ea266bb859525ab2d9948d4f\",\n  \"rawLogPath\": \"/private/tmp/ios003-canonical-product-tests-r1-20261015.log\"\n}\n"
```

<a id="payload-05"></a>

## shadow-run.json

Original path: `artifacts/IOS-003/canonical-ask-20261015/shadow-run.json`

Byte length: `2949`

SHA256: `ae2d1bf3550192e599fabb048d09ba3778131d0d6fa72b57eb0edcb5adabaa8b`

Encoding: `utf8-json-string`

```json
"{\n  \"sourceHead\": \"2138d8091379c193188cabd9b42fe3d429c13795\",\n  \"shadow\": \"/private/tmp/ios003-canonical-shadow-5528f7d3\",\n  \"candidateOnly\": true,\n  \"modelsOriginalSHA256\": \"0181f41629bc8dd749cd9b8523b31089b191d2b2082bed759304569dba0cf453\",\n  \"modelsCandidateSHA256\": \"58fa4520f063d73dd3acd7c086afd5b99d4340b1c9ea891fc1309a099a994841\",\n  \"derivedData\": \"/private/tmp/ios003-canonical-shadow-dd-5528f7d3\",\n  \"simulator\": \"22BA88CC-D299-49FC-8EA7-F5CBE980202D\",\n  \"workingSourceFilesCopied\": [\n    \"ios/VisePanda/VisePanda/App/NativeSession.swift\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\",\n    \"ios/VisePanda/VisePanda/Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskCapture.swift\",\n    \"tests/contract/ios003-place-ui/canonical/NativeCanonicalPlaceAskTests.swift\",\n    \"tests/contract/ios003-place-ui/canonical/probe.swift\",\n    \"tests/contract/ios003-place-ui/canonical/run.py\",\n    \"tests/contract/ios003-place-ui/canonical/sql-history-positive.json\",\n    \"tests/contract/ios003-place-ui/canonical/sql-pending-unavailable-history.json\"\n  ],\n  \"sourceSHA256\": {\n    \"ios/VisePanda/VisePanda/App/NativeSession.swift\": \"55e46fe451c914a600962c9af5c0a410c2ac2b5d99a7cf2ca43fe399645e073b\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\": \"73d036539b0742d683b05caa8edfc529f1e09560f9316d43778f37b2a4f388ec\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\": \"6e28c02350d9ac6fc5dde9b231f314bc4503159fe1048e09078f458059bed947\",\n    \"ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\": \"0bebc4ccefba5df10da60c28018a15f5e6a919ed1f4f976ac315c2072c1c53b5\",\n    \"ios/VisePanda/VisePanda/Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskCapture.swift\": \"61af360f4aa5767f8f66199db1d231fb98f708331392be68796abf0c8f635d58\",\n    \"tests/contract/ios003-place-ui/canonical/NativeCanonicalPlaceAskTests.swift\": \"e319feebbd5c6ae7feb3e0a4f9af15cd3efda25ab9974d5dc88195c08af43df0\",\n    \"tests/contract/ios003-place-ui/canonical/probe.swift\": \"7f48ca4f335739496e965f70c48d9a18733d6b09654d44b400e3eb25eba7aa9a\",\n    \"tests/contract/ios003-place-ui/canonical/run.py\": \"831d6f13c7374ac957a9f675d4bb8d8b949b2c29df6ef2980435f97710a406ac\",\n    \"tests/contract/ios003-place-ui/canonical/sql-history-positive.json\": \"5923ce1e4e5a3dc9b56cd98a210c35ed82093df3d9bb5475cbf99a9504fef2ad\",\n    \"tests/contract/ios003-place-ui/canonical/sql-pending-unavailable-history.json\": \"9ec1703a4fb904ea8930590792385264699691cfa5245766eda1df61921d8d17\"\n  },\n  \"shadowBaseHead\": \"6325d3ad82a4f6f881de407da44668dc273e0ecc\",\n  \"finalLog\": \"/private/tmp/ios003-canonical-shadow-tests-r5-20261015.log\",\n  \"finalCandidateTestResult\": \"9/9 PASS; TEST SUCCEEDED; 2.459 seconds test execution\",\n  \"sqlFixtureRef\": \"198c66bf644483da97b7663cc06e321d4747f1fb\"\n}\n"
```

<a id="payload-06"></a>

## shared-hunks/NativeAskStore.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskStore.after.swift.gz`

Byte length: `8219`

SHA256: `0bce2e0060660411a87a761eb817db47a3f05424291bd4ac3efaa86d00abb265`

Encoding: `base64`

```text
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
```

<a id="payload-07"></a>

## shared-hunks/NativeAskStore.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskStore.before.swift.gz`

Byte length: `6439`

SHA256: `dbd72bf1b69efcbdaa5f8529b12dc3eded07061e8a552b94394dc8e80fc587d6`

Encoding: `base64`

```text
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
```

<a id="payload-08"></a>

## shared-hunks/NativeAskStore.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskStore.patch`

Byte length: `19404`

SHA256: `29115dedb1bdf88944b41cbdf4095310c251608defefd005d368b99867ff7254`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\n+++ b/ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\n@@ -10,6 +10,26 @@\n     private(set) var notice: String?\n     private(set) var scope: NativeDataScope?\n     private(set) var pending: NativeTextSubmission?\n+    private var canonicalAdoptedGeneration: UUID?\n+    private var canonicalAdoptedIntent: Intent?\n+    private var canonicalAdoptedNotice: String?\n+    private var canonicalSceneActive = false\n+    private var canonicalReadEpoch = UUID()\n+    private let canonicalUptime: () -> TimeInterval\n+    private var canonicalSelectedDeadlines: [String: TimeInterval] = [:]\n+    private(set) var canonicalSelectedTurnIDs: Set<String> = []\n+    private(set) var canonicalSelectedProofs: [String: NativeCanonicalPlaceHistoryProof] = [:]\n+    private(set) var canonicalSelectedReadUnavailable = false\n+    var hasCanonicalSelectedResults: Bool { !canonicalSelectedTurnIDs.isEmpty }\n+    func canonicalSelectedCurrent(_ turnID: String, scope current: NativeDataScope?) -> Bool {\n+        current != nil && current == scope && canonicalSceneActive && (canonicalSelectedDeadlines[turnID].map { canonicalUptime() < $0 } ?? false)\n+    }\n+    func hasCurrentCanonicalSelected(scope current: NativeDataScope?) -> Bool {\n+        canonicalSelectedTurnIDs.contains { canonicalSelectedCurrent($0, scope: current) }\n+    }\n+    var canonicalSelectedRefreshDelay: TimeInterval {\n+        max(1, (canonicalSelectedDeadlines.values.min() ?? canonicalUptime() + 30) - canonicalUptime() - 5)\n+    }\n     var draft = \"\"\n     var city = \"shanghai\"\n     private var groundedDeadline: TimeInterval = 0\n@@ -30,6 +50,7 @@\n     private var aiAssistTokens: [String: UUID] = [:]\n     let mode: NativeAskMode\n     private var base: String { mode.base }\n+    private var policyResponseVersion: Int { mode == .serviceTask ? 1 : mode.version }\n     enum Intent: Equatable {\n         case restoring, newGoal, awaiting(String), continuation(NativeTextTurn), blocked\n     }\n@@ -37,8 +58,8 @@\n     private var boundNotice: String?\n     private var pendingNotice: String?\n     private var pendingAcknowledged = false\n-    init(mode: NativeAskMode = .currentInput) {\n-        self.mode = mode\n+    init(mode: NativeAskMode = .currentInput, canonicalUptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {\n+        self.mode = mode; self.canonicalUptime = canonicalUptime\n         intent = mode.usesTask ? .restoring : .newGoal\n     }\n     var noticeIdentity: String? {\n@@ -57,7 +78,7 @@\n         guard hasObsoletePending, let pending else { return }\n         await perform(session) { current in\n             let reply: NativeTextAction = try await self.call(session, current, suffix: \"/consent\", method: \"DELETE\", body: [\"policyId\": pending.policyId])\n-            guard reply.version == self.mode.version, reply.kind == \"withdrawn\" else { throw NativeDataError.invalidResponse }\n+            guard reply.version == self.policyResponseVersion, reply.kind == \"withdrawn\" else { throw NativeDataError.invalidResponse }\n             try session.clearPendingAsk(matching: pending)\n             self.pending = nil; self.pendingNotice = nil; self.pendingAcknowledged = false; self.draft = \"\"; self.intent = .blocked\n             try await self.load(session, current)\n@@ -96,6 +117,9 @@\n \n     func reset(for next: NativeDataScope?) {\n         guard scope != next else { return }\n+        canonicalAdoptedIntent = nil; canonicalAdoptedNotice = nil\n+        canonicalSelectedDeadlines = [:]; canonicalSelectedTurnIDs = []; canonicalSelectedProofs = [:]; canonicalSelectedReadUnavailable = false\n+        canonicalReadEpoch = UUID()\n         intent = mode.usesTask ? .restoring : .newGoal; boundNotice = nil; pendingNotice = nil; pendingAcknowledged = false\n         groundedDeadline = 0\n         eventRead = nil; eventCursors = [:]\n@@ -106,6 +130,7 @@\n     /// Hide read results and invalidate in-flight operations without discarding\n     /// a same-account unsent draft during temporary authentication loss.\n     func suspendReads() {\n+        canonicalSelectedDeadlines = [:]\n         groundedDeadline = 0\n         eventRead = nil\n         aiAssist = [:]; aiAssistTokens = [:]\n@@ -116,6 +141,7 @@\n     func applyTurnErasure(_ erased: NativeTurnDataErasure) {\n         guard scope == erased.scope else { return }\n         readGeneration = UUID()\n+        canonicalSelectedDeadlines = [:]\n         turns.removeAll { erased.turnIDs.contains($0.turnId) }\n         if let eventTurnID, erased.turnIDs.contains(eventTurnID) { eventRead = nil; self.eventTurnID = nil }\n         for id in erased.turnIDs { aiAssist[id] = nil; aiAssistTokens[id] = nil; eventCursors[id] = nil }\n@@ -128,6 +154,7 @@\n         // An empty visible cache can still have an old history request in flight.\n         // Invalidate that read without invalidating an unrelated send's bytes.\n         readGeneration = UUID()\n+        canonicalSelectedDeadlines = [:]\n         let pendingAffected = pending.map { erased.turnIDs.contains($0.turnId) || erased.threadIDs.contains($0.threadId) } == true\n         let visibleAffected = turns.contains { erased.turnIDs.contains($0.turnId) || erased.threadIDs.contains($0.threadId) }\n         let intentAffected: Bool\n@@ -260,7 +287,7 @@\n         await perform(session) { current in\n             guard self.policy == reviewed else { throw NativeDataError.staleSessionResponse }\n             let reply: NativeTextAction = try await self.call(session, current, suffix: \"/consent\", method: \"POST\", body: [\"policyId\": reviewed.id, \"noticeHash\": reviewed.noticeHash])\n-            guard reply.version == self.mode.version && reply.kind == \"accepted\" else { throw NativeDataError.invalidResponse }\n+            guard reply.version == self.policyResponseVersion && reply.kind == \"accepted\" else { throw NativeDataError.invalidResponse }\n             try await self.load(session, current)\n         }\n     }\n@@ -270,7 +297,7 @@\n         await perform(session) { current in\n             guard self.policy == policy else { throw NativeDataError.staleSessionResponse }\n             let reply: NativeTextAction = try await self.call(session, current, suffix: \"/consent\", method: \"DELETE\", body: [\"policyId\": policy.id])\n-            guard reply.version == self.mode.version && reply.kind == \"withdrawn\" else { throw NativeDataError.invalidResponse }\n+            guard reply.version == self.policyResponseVersion && reply.kind == \"withdrawn\" else { throw NativeDataError.invalidResponse }\n             self.turns = []; self.draft = \"\"; self.intent = .restoring\n             if let pending = self.pending, pending.policyId == policy.id {\n                 try session.clearPendingAsk(matching: pending)\n@@ -280,10 +307,71 @@\n         }\n     }\n \n+    func canonicalSceneChanged(active: Bool) {\n+        canonicalReadEpoch = UUID()\n+        canonicalSceneActive = active\n+        if !active { canonicalAdoptedIntent = nil; canonicalAdoptedNotice = nil; canonicalSelectedDeadlines = [:] }\n+    }\n+    func invalidateCanonicalAdoption() { canonicalAdoptedIntent = nil; canonicalAdoptedNotice = nil }\n+    func canonicalRecheckFailed() { invalidateCanonicalAdoption(); notice = \"CANONICAL_PLACE_RECHECK_REQUIRED\" }\n+    func adoptCanonicalPlaceAsk(navigationID: UUID, locale: String, session: NativeSession) {\n+        guard canonicalSceneActive, mode == .serviceTask, scope == session.dataScope,\n+              !busy, pending == nil, !session.canonicalPlaceAskRecoveryRequired,\n+              policy?.consentState == .accepted, permitsSubmission else { notice = \"CANONICAL_PLACE_UNSUPPORTED\"; return }\n+        do {\n+            try session.adoptCanonicalPlaceAsk(navigationID: navigationID, locale: locale)\n+            canonicalAdoptedIntent = intent; canonicalAdoptedNotice = noticeIdentity; canonicalAdoptedGeneration = session.canonicalPlaceAskReferenceGeneration; notice = nil\n+        } catch { notice = \"CANONICAL_PLACE_RECHECK_REQUIRED\" }\n+    }\n+    func recoverCanonicalPlaceAsk(using session: NativeSession) async {\n+        guard canonicalSceneActive, let retained = session.canonicalPlaceAskPending,\n+              retained.scope == session.dataScope, retained.scopeKind == \"thread\", mode == .serviceTask else { notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\"; return }\n+        await perform(session) { current in\n+            do {\n+                let bytes = try await session.readCanonicalPlaceAskReceipt(retained)\n+                try self.ensure(session, current)\n+                guard self.canonicalSceneActive else { self.notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\"; return }\n+                try await self.acceptCanonicalPlaceAsk(bytes, retained: retained, session: session, current: current)\n+            } catch { self.notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\" }\n+        }\n+    }\n+    private func acceptCanonicalPlaceAsk(_ bytes: Data, retained: NativeCanonicalPlaceAskPending,\n+                                         session: NativeSession, current: Context) async throws {\n+        switch try NativeCanonicalPlaceAskResponse.decode(bytes, pending: retained, expectedDigest: retained.requestDigest) {\n+        case .accepted(let originalReceipt, let turn):\n+            let original = try JSONDecoder().decode(NativeTextSubmission.self, from: retained.submission)\n+            let accepted = try JSONDecoder().decode(NativeTextAccepted.self, from: originalReceipt)\n+            guard accepted.matches(original, version: mode.version) else { throw NativeDataError.invalidResponse }\n+            let observer = session.journalDataObservation(.ask), ticket = observer.begin()\n+            try session.acknowledgeCanonicalPlaceAsk(retained, receipt: bytes)\n+            observer.finish(ticket, retained.operationID)\n+            canonicalAdoptedIntent = nil; canonicalAdoptedNotice = nil\n+            intent = .awaiting(turn)\n+            if draft == original.text { draft = \"\" }\n+            try await load(session, current)\n+        case .unknown: notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\"\n+        case .notSubmitted: notice = \"CANONICAL_PLACE_NOT_SUBMITTED\"\n+        case .unavailable(let reason): notice = \"CANONICAL_PLACE_\" + reason\n+        }\n+    }\n+\n     func send(locale: String, using session: NativeSession) async {\n         guard canSend, let policy else { return }\n+        guard session.canonicalPlaceAskNavigation == nil else { notice = \"CANONICAL_PLACE_RECHECK_REQUIRED\"; return }\n+        guard !session.canonicalPlaceAskRecoveryRequired else { notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\"; return }\n         await perform(session) { current in\n             guard self.policy == policy else { throw NativeDataError.staleSessionResponse }\n+            let capture = session.canonicalPlaceAskSelection\n+            if self.mode == .serviceTask, capture == nil, case .continuation(let parent) = self.intent,\n+               parent.result != nil || self.canonicalSelectedTurnIDs.contains(parent.id) {\n+                self.notice = \"CANONICAL_PLACE_RECHECK_REQUIRED\"; return // Never continue a selected Task through an untyped legacy submission.\n+            }\n+            if let capture {\n+                guard self.mode == .serviceTask, self.pending == nil, self.canonicalSceneActive,\n+                      self.canonicalAdoptedIntent == self.intent, self.canonicalAdoptedNotice == self.noticeIdentity,\n+                      self.canonicalAdoptedGeneration == session.canonicalPlaceAskReferenceGeneration,\n+                      capture.current(scope: current.scope, locale: locale) else { self.notice = \"CANONICAL_PLACE_RECHECK_REQUIRED\"; return }\n+            }\n             if self.pending == nil {\n                 var request = NativeTextSubmission(threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id, locale: locale, text: self.draft)\n                 if self.mode.usesTask {\n@@ -303,6 +391,24 @@\n                     else { request.city = self.city }\n                     guard request.city.map(NativeKnowledgeSelection.cities.contains) == true else { throw NativeDataError.invalidResponse }\n                 }\n+                if let capture {\n+                    let retained = try NativeCanonicalPlaceAskPending(originalTask: request, capture: capture)\n+                    try session.retainCanonicalPlaceAsk(retained, policy: policy)\n+                    do {\n+                        let adoptedIntent = self.canonicalAdoptedIntent, adoptedNotice = self.canonicalAdoptedNotice\n+                        let generation = self.canonicalAdoptedGeneration\n+                        let bytes = try await session.canonicalPlaceAskRequest(retained, beforeSend: {\n+                            self.canonicalSceneActive && self.operation == current.token && self.scope == current.scope\n+                                && self.canonicalAdoptedIntent == adoptedIntent && self.intent == adoptedIntent\n+                                && self.canonicalAdoptedNotice == adoptedNotice && self.noticeIdentity == adoptedNotice\n+                                && session.canonicalPlaceAskReferenceGeneration == generation\n+                        })\n+                        try self.ensure(session, current)\n+                        guard self.canonicalSceneActive else { self.notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\"; return }\n+                        try await self.acceptCanonicalPlaceAsk(bytes, retained: retained, session: session, current: current)\n+                    } catch { self.notice = \"CANONICAL_PLACE_RECOVERY_REQUIRED\" }\n+                    return\n+                }\n                 let retained = try session.retainPendingAsk(request, policy: policy, mode: self.mode)\n                 self.pendingNotice = retained.noticeIdentity\n                 self.pending = request\n@@ -338,9 +444,18 @@\n     private func load(_ session: NativeSession, _ current: Context) async throws {\n         let generation = readGeneration\n         let policy: NativeTextPolicyReply = try await call(session, current, suffix: \"/policy\", method: \"GET\")\n-        guard policy.version == mode.version && policy.kind == \"policy\" && policy.policy.valid else { throw NativeDataError.invalidResponse }\n+        guard policy.version == policyResponseVersion && policy.kind == \"policy\" && policy.policy.valid else { throw NativeDataError.invalidResponse }\n         let started = ProcessInfo.processInfo.systemUptime\n-        let history: NativeTextHistory = try await call(session, current, suffix: \"/turns\", method: \"GET\")\n+        let selectedStarted = canonicalUptime(), selectedEpoch = canonicalReadEpoch\n+        var selectedRows: [NativeCanonicalPlaceHistoryRow] = []\n+        let history: NativeTextHistory\n+        if mode == .serviceTask {\n+            let selected: NativeCanonicalPlaceHistory = try await call(session, current, suffix: \"/turns\", method: \"GET\")\n+            history = .init(version: selected.version, kind: selected.kind, turns: selected.turns.map(\\.turn))\n+            selectedRows = selected.turns\n+        } else {\n+            history = try await call(session, current, suffix: \"/turns\", method: \"GET\")\n+        }\n         guard readGeneration == generation else { throw NativeDataError.staleSessionResponse }\n         guard history.version == mode.version && history.kind == (mode == .grounded ? \"grounded_history\" : \"history\") && history.turns.count <= 20\n             && history.turns.allSatisfy(\\.valid) && Set(history.turns.map(\\.id)).count == history.turns.count else { throw NativeDataError.invalidResponse }\n@@ -351,6 +466,10 @@\n         boundNotice = identity\n         if changed { draft = \"\"; intent = .blocked }\n         if policy.policy.consentState != .accepted {\n+            if mode == .serviceTask {\n+                canonicalSelectedReadUnavailable = !canonicalSelectedTurnIDs.isEmpty\n+                canonicalSelectedDeadlines = [:]; canonicalSelectedTurnIDs = []; canonicalSelectedProofs = [:]\n+            }\n             // Consent screens also need a bounded refresh interval. A zero deadline\n             // otherwise polls every second and races the user's acceptance tap.\n             if mode == .grounded { groundedDeadline = ProcessInfo.processInfo.systemUptime + max(1, 30 - (ProcessInfo.processInfo.systemUptime - started)) }\n@@ -373,6 +492,18 @@\n                 lifetime = min(lifetime, try result.lifetime(for: turn, elapsed: elapsed))\n             }\n             groundedDeadline = ProcessInfo.processInfo.systemUptime + lifetime\n+        } else if mode == .serviceTask {\n+            var deadlines: [String: TimeInterval] = [:]\n+            for row in selectedRows where row.selected && canonicalSceneActive && canonicalReadEpoch == selectedEpoch {\n+                // Invalid/unavailable selected projections never fall back to plain output.\n+                if let lifetime = try? row.lifetime(elapsed: canonicalUptime() - selectedStarted) {\n+                    deadlines[row.turn.id] = canonicalUptime() + lifetime\n+                }\n+            }\n+            canonicalSelectedReadUnavailable = !canonicalSelectedTurnIDs.isEmpty && selectedRows.isEmpty\n+            canonicalSelectedDeadlines = deadlines\n+            canonicalSelectedTurnIDs = Set(selectedRows.filter(\\.selected).map { $0.turn.id })\n+            canonicalSelectedProofs = Dictionary(uniqueKeysWithValues: selectedRows.compactMap { row in row.proof.map { (row.turn.id, $0) } })\n         } else if history.turns.contains(where: { $0.result != nil }) { throw NativeDataError.invalidResponse }\n         turns = history.turns\n         if let pending {\n@@ -396,6 +527,7 @@\n \n     private func reconcileIntent(changed: Bool) {\n         guard mode.usesTask else { return }\n+        if mode == .serviceTask && canonicalSelectedReadUnavailable { intent = .blocked; return } // Missing current projection never silently births another Goal/Task.\n         // A deliberate new question is not replaced by a late result from an old task.\n         if intent == .newGoal || changed { return }\n         let latest: NativeTextTurn?\n@@ -417,7 +549,9 @@\n     }\n \n     private func call<T: Decodable>(_ session: NativeSession, _ current: Context, suffix: String, method: String, body: [String: String]? = nil) async throws -> T {\n-        let data = try await session.askRequest(path: base + suffix, method: method, body: body.map { try JSONEncoder().encode($0) })\n+        let policyPath = mode == .serviceTask && [\"/policy\", \"/consent\"].contains(suffix)\n+        let path = (policyPath ? \"api/chat/native/v1\" : base) + suffix\n+        let data = try await session.askRequest(path: path, method: method, body: body.map { try JSONEncoder().encode($0) })\n         try ensure(session, current)\n         return try JSONDecoder().decode(T.self, from: data)\n     }\n@@ -444,6 +578,8 @@\n             guard !Task.isCancelled else { return }\n             // Hide previously returned bodies after any failed policy/session refresh.\n             groundedDeadline = 0\n+            canonicalSelectedReadUnavailable = !canonicalSelectedTurnIDs.isEmpty\n+            canonicalSelectedDeadlines = [:]; canonicalSelectedTurnIDs = []; canonicalSelectedProofs = [:]\n             policy = nil; turns = []\n             if case NativeDataError.server(let code) = error { notice = code } else { notice = \"retry\" }\n         }\n"
```

<a id="payload-09"></a>

## shared-hunks/NativeAskView.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskView.after.swift.gz`

Byte length: `10851`

SHA256: `ee7535986cb532136f2e9ddd164474b924947a882aaf6fff363301f09ed22373`

Encoding: `base64`

```text
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
```

<a id="payload-10"></a>

## shared-hunks/NativeAskView.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskView.before.swift.gz`

Byte length: `8094`

SHA256: `beed8e25f3b1de907b8040c392c045ce9ab76f14f15a2653bfad0162d490941b`

Encoding: `base64`

```text
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
```

<a id="payload-11"></a>

## shared-hunks/NativeAskView.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAskView.patch`

Byte length: `18325`

SHA256: `3eeb1f9174d3e2e94b4e2dd75c947230f9128b2633204ff0139f385b1da9a2b1`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\n+++ b/ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\n@@ -5,6 +5,7 @@\n     @Environment(AppSettings.self) private var settings\n     @Environment(\\.scenePhase) private var scenePhase\n     @State private var store = NativeAskStore()\n+    @State private var canonicalRecheckEpoch = UUID()\n     @State private var reviewed = false\n     @State private var showNotice = true\n     @State private var showReviewedQuestion = false\n@@ -16,6 +17,7 @@\n \n     private var session: NativeSession { settings.nativeSession }\n     private var visible: Bool { isActive && !showReviewedQuestion && planningRequest == nil && scenePhase == .active }\n+    private var canonicalReadKey: String { \"\\(visible):\\(String(describing: session.dataScope)):\\(store.hasCanonicalSelectedResults)\" }\n     private var groundedReadKey: String { \"\\(visible):\\(String(describing: session.dataScope)):\\(store.pollKey)\" }\n     private var active: Bool { session.dataScope != nil && store.scope == session.dataScope }\n \n@@ -34,6 +36,7 @@\n                         Button(\"ask.task.stop_previous\") { Task { await store.stopPreviousRequest(using: session) } }\n                             .disabled(store.busy).accessibilityIdentifier(\"native-ask.stop-previous\")\n                     }\n+                    canonicalPlaceAskControls\n                     if store.notice != nil { Text(\"ask.local.retry_hint\").font(.footnote).accessibilityIdentifier(\"native-ask.error\") }\n                     Text(\"ask.local.history\").font(.title2.bold())\n                     TimelineView(.periodic(from: .now, by: 1)) { _ in\n@@ -124,6 +127,15 @@\n                 if !store.busy { await store.reload(using: session) }\n             }\n         }\n+        .task(id: canonicalReadKey) {\n+            guard store.mode == .serviceTask, visible, store.hasCanonicalSelectedResults, let initial = session.dataScope else { return }\n+            if !store.busy && !session.busy && !store.hasCurrentCanonicalSelected(scope: initial) { await store.reload(using: session) }\n+            while !Task.isCancelled, visible, session.dataScope == initial, store.hasCanonicalSelectedResults {\n+                do { try await Task.sleep(for: .seconds(store.canonicalSelectedRefreshDelay)) } catch { return }\n+                guard !Task.isCancelled, visible, session.dataScope == initial else { return }\n+                if !store.busy && !session.busy { await store.reload(using: session) }\n+            }\n+        }\n         .task(id: groundedReadKey) {\n             guard store.mode == .grounded else { return }\n             store.reset(for: session.retainedDataScope)\n@@ -143,6 +155,12 @@\n                 do { try await Task.sleep(for: .seconds(delay)) } catch { return }\n             } while !Task.isCancelled && visible && session.dataScope == initial\n         }\n+        .onChange(of: visible, initial: true) { _, value in\n+            canonicalRecheckEpoch = UUID(); store.canonicalSceneChanged(active: value)\n+            if !value { session.invalidateCanonicalPlaceAskReference() }\n+        }\n+        .onChange(of: settings.selectedLocale) { _, _ in canonicalRecheckEpoch = UUID(); store.invalidateCanonicalAdoption(); session.invalidateCanonicalPlaceAskReference() }\n+        .onDisappear { canonicalRecheckEpoch = UUID(); store.canonicalSceneChanged(active: false); session.invalidateCanonicalPlaceAskReference() }\n         .onChange(of: session.turnDataErasure?.id) { _, _ in\n             guard let erased = session.turnDataErasure,\n                   (try? session.communitySafetyActor()) == erased.actor else { return }\n@@ -199,7 +217,38 @@\n         .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))\n     }\n \n-    private func result(_ turn: NativeTextTurn) -> some View {\n+    @ViewBuilder private func result(_ turn: NativeTextTurn) -> some View {\n+        if store.mode == .serviceTask, store.canonicalSelectedTurnIDs.contains(turn.id) {\n+            TimelineView(.periodic(from: .now, by: 1)) { _ in\n+                VStack(alignment: .leading, spacing: 10) {\n+                    Text(turn.input).font(.headline).textSelection(.enabled)\n+                    HStack {\n+                        Text(settings.selectedLocale == .zh ? \"原任务状态：\" : \"Original Task status:\")\n+                        Text(LocalizedStringKey(label(turn)))\n+                    }.font(.caption).foregroundStyle(Color.vpSecondaryText)\n+                    if visible, store.canonicalSelectedCurrent(turn.id, scope: session.dataScope), let projection = turn.result, projection.projection == \"current\" {\n+                        groundedResult(turn, projection, allowAiAssist: false)\n+                    } else {\n+                        Text(settings.selectedLocale == .zh ? \"当前地点依据正在重新核对或不可用，已隐藏事实内容。原提问与操作回执保留。\" : \"The selected-place evidence is being rechecked or unavailable. Factual content is hidden; the original question and receipt are retained.\")\n+                            .accessibilityIdentifier(\"canonical-place.result.unavailable.\\(turn.id)\")\n+                    }\n+                    if let proof = store.canonicalSelectedProofs[turn.id] {\n+                        Button(settings.selectedLocale == .zh ? \"重读这个任务的同一地点引用\" : \"Reread this Task's exact place reference\") {\n+                            Task { await recheckCanonicalPlaceAskHistory(proof, turnID: turn.id) }\n+                        }.disabled(!visible || store.busy || session.canonicalPlaceAskRecoveryRequired)\n+                    }\n+                    if turn.waiting {\n+                        Button(\"ask.local.cancel\") {\n+                            guard visible else { return }\n+                            Task { await store.cancel(turn, using: session) }\n+                        }.disabled(store.busy).accessibilityIdentifier(\"canonical-place.cancel.\\(turn.id)\")\n+                    }\n+                }.frame(maxWidth: .infinity, alignment: .leading).padding(16)\n+                    .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))\n+            }\n+        } else { legacyResult(turn) }\n+    }\n+    private func legacyResult(_ turn: NativeTextTurn) -> some View {\n         VStack(alignment: .leading, spacing: 10) {\n             Text(turn.input).font(.headline)\n             if store.mode == .grounded, let result = turn.result {\n@@ -250,7 +299,7 @@\n         }\n     }\n \n-    @ViewBuilder private func groundedResult(_ turn: NativeTextTurn, _ result: NativeGroundedResult) -> some View {\n+    @ViewBuilder private func groundedResult(_ turn: NativeTextTurn, _ result: NativeGroundedResult, allowAiAssist: Bool = true) -> some View {\n         let chinese = turn.locale == \"zh\"\n         if let intent = result.intent, NativeKnowledgeAnswer.definition(intent, subjectId: result.placeSubjectId) != nil {\n             if let placeName = result.placeName { Text(verbatim: placeName).font(.subheadline.bold()) }\n@@ -273,7 +322,7 @@\n                 Text(chinese ? \"当前无法重新核对原答案，已隐藏事实内容，请稍后重试。\" : \"The saved evidence cannot be rechecked right now. Factual content is hidden; try again later.\")\n                     .accessibilityIdentifier(\"grounded.unavailable\")\n             }\n-            if result.originalOutcome == \"blocked\" { aiAssistPanel(turn, chinese: chinese) }\n+            if result.originalOutcome == \"blocked\", allowAiAssist { aiAssistPanel(turn, chinese: chinese) }\n         } else if result.placeResolution == \"ambiguous\" {\n             Text(chinese ? \"这个名称匹配到多个已审核景点。请提供完整官方名称，并核对所选城市；本模式不读取上一轮内容。\" : \"More than one reviewed attraction matches this name. Please provide its full official name and check the selected city; this mode does not read earlier messages.\")\n                 .accessibilityIdentifier(\"grounded.place-ambiguous\")\n@@ -372,6 +421,102 @@\n         }\n     }\n \n+    @ViewBuilder private var canonicalPlaceAskControls: some View {\n+        let chinese = settings.selectedLocale == .zh\n+        if let source = session.exploreAskHandoff, source.scope == session.dataScope {\n+            VStack(alignment: .leading, spacing: 8) {\n+                Text(chinese ? \"选中地点：\\(source.name)\" : \"Selected place: \\(source.name)\")\n+                if let capture = session.canonicalPlaceAskNavigation {\n+                    TimelineView(.periodic(from: .now, by: 1)) { _ in\n+                        let current = capture.current(scope: session.dataScope, locale: chinese ? \"zh\" : \"en\")\n+                        Button(chinese ? \"采用这个地点引用\" : \"Adopt this place reference\") {\n+                            guard visible else { return }\n+                            store.adoptCanonicalPlaceAsk(navigationID: source.id, locale: chinese ? \"zh\" : \"en\", session: session)\n+                        }.disabled(!visible || !current || store.busy || store.pending != nil || session.canonicalPlaceAskRecoveryRequired || store.mode != .serviceTask)\n+                            .accessibilityIdentifier(\"canonical-place.adopt\")\n+                        if !current { Text(chinese ? \"来源已过期或语言已变化。请回同一地点重新读取；原稿保留。\" : \"Source expired or language changed. Reread the same place; the draft is preserved.\").font(.caption) }\n+                    }\n+                }\n+                if store.mode != .serviceTask {\n+                    Text(chinese ? \"当前提问类型不支持这个地点引用。不会自动切换模式、创建目标或任务。\" : \"This question type does not support the place reference. Mode, Goal and Task are not changed automatically.\").font(.caption)\n+                }\n+                if let capture = session.canonicalPlaceAskNavigation {\n+                    Button(chinese ? \"重读同一准确地点\" : \"Reread this exact place\") { Task { await recheckCanonicalPlaceAsk(capture) } }\n+                        .disabled(store.busy || !visible || session.canonicalPlaceAskRecoveryRequired)\n+                }\n+                Button(chinese ? \"放弃这次导航引用\" : \"Discard navigation reference\") { session.clearExploreAsk() }\n+            }\n+        }\n+        if let capture = session.canonicalPlaceAskSelection {\n+            VStack(alignment: .leading, spacing: 8) {\n+                Text(chinese ? \"本次采用地点：\\(capture.title)\" : \"Place for this question: \\(capture.title)\")\n+                Text(chinese ? \"仅带入第一方引用；不授予事实、供应商或知识使用资格。输入问题后由你明确发送。\" : \"First-party reference only, with no fact, provider or knowledge eligibility. Enter a question and send explicitly.\").font(.caption)\n+                Button(chinese ? \"重读同一准确地点\" : \"Reread this exact place\") { Task { await recheckCanonicalPlaceAsk(capture) } }\n+                    .disabled(store.busy || !visible || session.canonicalPlaceAskRecoveryRequired)\n+                Button(chinese ? \"移除本次地点引用\" : \"Remove place reference\") { session.discardCanonicalPlaceAskSelection(); store.invalidateCanonicalAdoption() }\n+                    .disabled(store.busy || session.canonicalPlaceAskRecoveryRequired)\n+            }\n+        }\n+        if let notice = store.notice, notice.hasPrefix(\"CANONICAL_PLACE_\") {\n+            Text(canonicalPlaceAskMessage(notice, chinese: chinese)).font(.caption)\n+                .accessibilityIdentifier(\"canonical-place.notice\")\n+        }\n+        if store.canonicalSelectedReadUnavailable {\n+            Text(chinese ? \"这次未读到可展示的当前地点依据，已隐藏事实内容。这不代表原任务未发生；请核对原操作与来源。\" : \"No displayable current place evidence was returned. Factual content is hidden; this does not prove the original Task did not occur. Check its original operation and sources.\").font(.caption)\n+        }\n+        if session.canonicalPlaceAskRecoveryRequired {\n+            VStack(alignment: .leading, spacing: 8) {\n+                Text(chinese ? \"原地点提问尚待核对。原请求已保留，不能新发或盲重试。\" : \"The original place question needs checking. Its request is retained; no new submission or blind retry is allowed.\").font(.caption)\n+                Button(chinese ? \"只读取原提问回执\" : \"Read original receipt only\") { Task { await store.recoverCanonicalPlaceAsk(using: session) } }\n+                    .disabled(store.busy || !visible).accessibilityIdentifier(\"canonical-place.recover\")\n+            }\n+        }\n+    }\n+\n+    private func canonicalPlaceAskMessage(_ code: String, chinese: Bool) -> String {\n+        switch code {\n+        case \"CANONICAL_PLACE_UNSUPPORTED\", \"CANONICAL_PLACE_original_submission_unsupported\", \"CANONICAL_PLACE_incompatible_task\", \"CANONICAL_PLACE_incompatible_goal\":\n+            return chinese ? \"当前任务不支持这个地点提问。不会改换模式、新建目标或另建任务；原稿保留。\" : \"This Task does not support the place question. Mode, Goal and Task stay unchanged; the draft is preserved.\"\n+        case \"CANONICAL_PLACE_NOT_SUBMITTED\":\n+            return chinese ? \"原操作读回暂未发现提交；这不授予重新提交许可。保留原请求，可继续读取原回执。\" : \"The original operation read found no submission. This does not authorize a resubmission. The original request is retained for receipt recovery.\"\n+        case \"CANONICAL_PLACE_RECOVERY_REQUIRED\":\n+            return chinese ? \"原操作结果未知。只读原请求的回执，不新发、不重跑模型；原稿保留。\" : \"The original outcome is unknown. Read its receipt only; no new submission or model retry. The draft is preserved.\"\n+        case \"CANONICAL_PLACE_policy_denied\", \"CANONICAL_PLACE_unauthorized\":\n+            return chinese ? \"当前身份或使用许可待重新核对。不会重新授权供应商，也不改原操作。\" : \"Identity or consent needs checking. No supplier permission is granted and the original operation is unchanged.\"\n+        case \"CANONICAL_PLACE_selection_changed\", \"CANONICAL_PLACE_selection_ambiguous\", \"CANONICAL_PLACE_source_unavailable\", \"CANONICAL_PLACE_RECHECK_REQUIRED\":\n+            return chinese ? \"地点、映射、来源、语言或当前目标需重读。请明确重读同一地点并重新采用；不会猜测城市、替换地点或改写原稿。\" : \"Place, mapping, source, language or current goal needs checking. Reread and adopt the exact place; no city guess, replacement place or draft rewrite.\"\n+        default:\n+            return chinese ? \"地点提问暂不可用。请核对原请求与来源；未确认原结果前不会重复发送。\" : \"Place Ask is unavailable. Check the original request and source; no duplicate send before the original result is resolved.\"\n+        }\n+    }\n+\n+    private func recheckCanonicalPlaceAskHistory(_ proof: NativeCanonicalPlaceHistoryProof, turnID: String) async {\n+        let locale = settings.selectedLocale == .zh ? \"zh\" : settings.selectedLocale.rawValue\n+        guard visible, !store.busy else { return }\n+        canonicalRecheckEpoch = UUID(); let epoch = canonicalRecheckEpoch\n+        do {\n+            let refreshed = try await session.recheckCanonicalPlaceAskHistory(proof, locale: locale)\n+            guard visible, epoch == canonicalRecheckEpoch,\n+                  locale == (settings.selectedLocale == .zh ? \"zh\" : settings.selectedLocale.rawValue),\n+                  store.canonicalSelectedProofs[turnID]?.operationID == refreshed.operationID,\n+                  store.canonicalSelectedProofs[turnID]?.requestDigest == refreshed.requestDigest else { return }\n+            store.invalidateCanonicalAdoption()\n+            _ = session.stageCanonicalPlaceAskHistoryRefresh(refreshed)\n+        } catch { store.canonicalRecheckFailed() }\n+    }\n+\n+    private func recheckCanonicalPlaceAsk(_ capture: NativeCanonicalPlaceAskCapture) async {\n+        let locale = settings.selectedLocale == .zh ? \"zh\" : \"en\"\n+        guard visible, !store.busy else { return }\n+        canonicalRecheckEpoch = UUID(); let epoch = canonicalRecheckEpoch\n+        do {\n+            let refreshed = try await session.recheckCanonicalPlaceAsk(capture, locale: locale)\n+            guard visible, epoch == canonicalRecheckEpoch, locale == (settings.selectedLocale == .zh ? \"zh\" : \"en\") else { return }\n+            store.invalidateCanonicalAdoption()\n+            _ = session.stageCanonicalPlaceAskRefresh(refreshed) // Identity CAS; never auto-adopt or send.\n+        } catch { store.canonicalRecheckFailed() }\n+    }\n+\n     private var composer: some View {\n         VStack(spacing: 8) {\n             if store.mode.usesTask {\n@@ -380,7 +525,7 @@\n                         .accessibilityIdentifier(\"native-ask.intent\")\n                     Spacer()\n                     Button(\"ask.task.new\") { store.startNewQuestion() }\n-                        .disabled(!store.canStartNew)\n+                        .disabled(!store.canStartNew || session.canonicalPlaceAskRecoveryRequired)\n                         .accessibilityIdentifier(\"native-ask.new-question\")\n                 }\n             }\n@@ -403,9 +548,9 @@\n                 Spacer()\n                 Button(LocalizedStringKey(store.pending == nil ? \"ask.send\" : \"ask.local.retry_original\")) {\n                     composing = false\n-                    Task { await store.send(locale: settings.selectedLocale == .zh ? \"zh\" : settings.selectedLocale.rawValue, using: session) }\n-                }\n-                .buttonStyle(.borderedProminent).disabled(!store.canSend)\n+                    guard visible else { return }; Task { await store.send(locale: settings.selectedLocale == .zh ? \"zh\" : settings.selectedLocale.rawValue, using: session) }\n+                }\n+                .buttonStyle(.borderedProminent).disabled(!store.canSend || session.canonicalPlaceAskRecoveryRequired || session.canonicalPlaceAskNavigation != nil)\n                 .accessibilityIdentifier(\"native-ask.send\")\n             }\n             if NativeRelativeOutline.make(from: store.draft, chinese: settings.selectedLocale == .zh) != nil {\n"
```

<a id="payload-12"></a>

## shared-hunks/NativeAssistantConversationView.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAssistantConversationView.after.swift.gz`

Byte length: `28405`

SHA256: `c08686dbf1ac533b2fa04a26fa374f34f9d8a83a8b4671e0ae59d2ad4a729a2b`

Encoding: `base64`

```text
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
```

<a id="payload-13"></a>

## shared-hunks/NativeAssistantConversationView.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAssistantConversationView.before.swift.gz`

Byte length: `26474`

SHA256: `f3b31f66db2095dc1f38f026a2e1b6213d9a644e761b84abf0c17cb714af7baa`

Encoding: `base64`

```text
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
```

<a id="payload-14"></a>

## shared-hunks/NativeAssistantConversationView.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeAssistantConversationView.patch`

Byte length: `15306`

SHA256: `dc0af2a1e4dc9c8c693752acdf267c53d68a832858e6d53baac7d11b56051905`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\n+++ b/ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\n@@ -455,6 +455,9 @@\n     @State private var paceOperationBlocked = false\n     @State private var memoryOperationBlocked=false\n     @State private var selectedMemoryBasis:[NativeTravelMemoryReference]=[]\n+    @State private var canonicalRecheckEpoch = UUID()\n+    @State private var canonicalPlaceAskRoot: NativeCanonicalPlaceAskRoot?\n+    @State private var canonicalPlaceAskNotice: String?\n     @State private var draft = \"\"\n     @State private var planningDraft = \"\"\n     @State private var showJourneyMaterials = false\n@@ -656,19 +659,7 @@\n                 if !entryBlocking && session.dataScope != nil && (policy?.consentState == .accepted || selection.conversationID != nil) {\n                     conversationControls\n                 }\n-                if let source=session.exploreAskHandoff,source.scope==session.dataScope,source.valid {\n-                    Text(chinese ? \"已选地点：\\(source.name)。身份与行程版本需重新核对；尚未发出消息。\":\"Selected place: \\(source.name). Identity and Trip version need rechecking; no message has been sent.\")\n-                    Button(chinese ? \"明确采用为本次输入\":\"Use explicitly for this input\"){\n-                        guard pending==nil,selectedSources.pending==nil else{return}\n-                        let input=exploreInput(source)\n-                        guard input.utf16.count<=4000 else{return}\n-                        draft=input\n-                        if goalHasCurrentMessage{operation=\"follow_up\"}\n-                        session.clearExploreAsk()\n-                    }.disabled(pending != nil || selectedSources.pending != nil || exploreInput(source).utf16.count>4000)\n-                    if exploreInput(source).utf16.count>4000 {Text(chinese ? \"请先缩短当前输入，再加入地点引用。\":\"Shorten the current input before adding the place reference.\").font(.caption)}\n-                    Button(chinese ? \"放弃此来源交接\":\"Discard this source handoff\"){session.clearExploreAsk()}\n-                }\n+                canonicalPlaceAskControls\n                 if entryBlocking {\n                     goalEntryStatus\n                 } else if let policy {\n@@ -984,6 +975,12 @@\n         .onChange(of: fiveResultSelection?.id) { _, _ in\n             if let value=fiveResultSelection {lastViewedArtifact = .init(artifactId:value.artifactID,revision:value.revision);retainNavigation()}\n         }\n+        .onChange(of: resultActive) { _, active in\n+            canonicalRecheckEpoch = UUID()\n+            if !active { session.invalidateCanonicalPlaceAskReference() }\n+        }\n+        .onChange(of: settings.selectedLocale) { _, _ in canonicalRecheckEpoch = UUID(); session.invalidateCanonicalPlaceAskReference() }\n+        .onDisappear { canonicalRecheckEpoch = UUID(); session.invalidateCanonicalPlaceAskReference() }\n         .onChange(of: shellSwitchBlocked, initial: true) { _, blocked in onSwitchBlock?(blocked) }\n         .onChange(of: session.busy) { wasBusy, isBusy in\n             if wasBusy && !isBusy && session.dataScope != nil {\n@@ -1139,9 +1136,77 @@\n         }\n     }\n \n-    private func exploreInput(_ source:NativeExploreAskHandoff)->String {\n-        let added=(chinese ? \"请帮我讨论我明确选择的地点：\":\"Please help me discuss this explicitly selected place: \")+source.name+\"\\ncanonical POI: \"+source.poiID+\"\\nTrip: \"+source.tripID+\" · v\"+String(source.tripVersion)+\"\\nProvider: \"+source.provider.rawValue+\" / \"+source.providerPoiID+\"\\nrecheck_required\"\n-        return draft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? added:draft+\"\\n\\n\"+added\n+    @ViewBuilder private var canonicalPlaceAskControls: some View {\n+                if let source=session.exploreAskHandoff,source.scope==session.dataScope,source.valid {\n+                    VStack(alignment: .leading, spacing: 8) {\n+                        Text(chinese ? \"已选地点：\\(source.name)。只带入引用，尚未发送问题。\" : \"Selected place: \\(source.name). Reference only; no question has been sent.\")\n+                        if let capture = session.canonicalPlaceAskNavigation {\n+                            TimelineView(.periodic(from: .now, by: 1)) { _ in\n+                                let current = capture.current(scope: session.dataScope, locale: chinese ? \"zh\" : \"en\")\n+                                Button(chinese ? \"明确采用这个地点引用\" : \"Use this place reference explicitly\") {\n+                                    guard pending == nil, selectedSources.pending == nil, !busy,\n+                                          policy?.consentState == .accepted, conversation != nil else { return }\n+                                    do {\n+                                        try session.adoptCanonicalPlaceAsk(navigationID: source.id, locale: chinese ? \"zh\" : \"en\")\n+                                        canonicalPlaceAskRoot = currentCanonicalPlaceAskRoot\n+                                        canonicalPlaceAskNotice = nil\n+                                    } catch { canonicalPlaceAskNotice = \"recheck\" }\n+                                }.disabled(!current || busy || pending != nil || selectedSources.pending != nil || policy?.consentState != .accepted || conversation == nil)\n+                                if !current { Text(chinese ? \"地点引用已过期或语言已变化。请返回同一地点重新读取；原稿保留。\" : \"The reference expired or the language changed. Return to the same place and reread; your draft is preserved.\").font(.caption) }\n+                            }\n+                            Button(chinese ? \"重读同一准确地点\" : \"Reread this exact place\") { Task { await recheckCanonicalPlaceAsk(capture) } }.disabled(busy || session.canonicalPlaceAskRecoveryRequired)\n+                        } else {\n+                            Text(chinese ? \"这个入口只有旧导航引用。请从同一地点重新读取完整引用后再采用。\" : \"This entry has only a legacy navigation reference. Reread the same place before adopting it.\").font(.caption)\n+                        }\n+                        Button(chinese ? \"放弃此来源交接\" : \"Discard this source handoff\") { session.clearExploreAsk() }\n+                    }\n+                }\n+                if let capture = session.canonicalPlaceAskSelection {\n+                    TimelineView(.periodic(from: .now, by: 1)) { _ in\n+                        VStack(alignment: .leading, spacing: 8) {\n+                            Text(chinese ? \"本次采用地点：\\(capture.title)\" : \"Place selected for this question: \\(capture.title)\")\n+                            Text(chinese ? \"仅为第一方地点引用；不代表事实、供应商或知识使用授权。仍由你输入问题并明确发送。\" : \"First-party place reference only, not fact, supplier or knowledge-use authorization. Enter your question and send explicitly.\").font(.caption)\n+                            if !capture.current(scope: session.dataScope, locale: chinese ? \"zh\" : \"en\") || canonicalPlaceAskRoot != currentCanonicalPlaceAskRoot {\n+                                Text(chinese ? \"引用或当前对话目标已失效，请回同一地点重读并重新采用。不会自动改变目标或创建任务，原稿保留。\" : \"The reference or conversation goal changed. Reread and adopt the same place. No goal or Task is created automatically; the draft is preserved.\").font(.caption)\n+                            }\n+                            Button(chinese ? \"重读同一准确地点\" : \"Reread this exact place\") { Task { await recheckCanonicalPlaceAsk(capture) } }.disabled(busy || session.canonicalPlaceAskRecoveryRequired)\n+                            Button(chinese ? \"移除本次地点引用\" : \"Remove this place reference\") {\n+                                session.discardCanonicalPlaceAskSelection(); canonicalPlaceAskRoot = nil\n+                            }.disabled(busy || session.canonicalPlaceAskPending != nil)\n+                        }\n+                    }\n+                }\n+                if let retained = session.canonicalPlaceAskPending, retained.scope == session.dataScope {\n+                    VStack(alignment: .leading, spacing: 8) {\n+                        Text(chinese ? \"原地点提问结果待核；已保留原请求，不能新发或盲重试。\" : \"The original place question is unresolved. Its request is retained; no new submission or blind retry is allowed.\").font(.caption)\n+                        Button(chinese ? \"只读取原提问回执\" : \"Read original question receipt only\") { Task { await readCanonicalPlaceAskReceipt() } }.disabled(busy)\n+                    }\n+                }\n+                if let canonicalPlaceAskNotice {\n+                    Text(canonicalPlaceAskNotice == \"original_submission_unsupported\"\n+                        ? (chinese ? \"当前对话目标没有兼容的任务与 Turn 接口，暂不能发送地点提问。不会自动新建或转换任务，原稿保留。\" : \"This conversation has no compatible Task/Turn admission. Place Ask cannot be sent; no Task is created or converted, and the draft is preserved.\")\n+                        : (chinese ? \"地点提问暂不可用。请核对原操作和来源；原稿保留。\" : \"Place Ask is unavailable. Check the original operation and source; the draft is preserved.\")).font(.caption)\n+                }\n+    }\n+    private func recheckCanonicalPlaceAsk(_ capture: NativeCanonicalPlaceAskCapture) async {\n+        let locale = chinese ? \"zh\" : \"en\"\n+        guard !busy, resultActive else { return }\n+        canonicalRecheckEpoch = UUID(); let epoch = canonicalRecheckEpoch\n+        do {\n+            let refreshed = try await session.recheckCanonicalPlaceAsk(capture, locale: locale)\n+            guard resultActive, epoch == canonicalRecheckEpoch, locale == (chinese ? \"zh\" : \"en\") else { return }\n+            canonicalPlaceAskRoot = nil; canonicalPlaceAskNotice = nil\n+            _ = session.stageCanonicalPlaceAskRefresh(refreshed)\n+        } catch { canonicalPlaceAskNotice = \"recheck\" }\n+    }\n+    private var currentCanonicalPlaceAskRoot: NativeCanonicalPlaceAskRoot {\n+        let related = [\"follow_up\", \"amendment\", \"clarification\"].contains(operation) ? goal : nil\n+        let parent = related.flatMap { current in\n+            conversation?.messages.last(where: { $0.goalId == current.goalId && $0.scopeVersion == current.scopeVersion })\n+        }\n+        return .init(conversationID: selection.conversationID, goalID: related?.goalId,\n+                     goalVersion: related?.scopeVersion, parentMessageID: parent?.messageId,\n+                     relationship: operation, locale: chinese ? \"zh\" : \"en\", policyID: policy?.id)\n     }\n \n     private var qualifiedMemoryBasis:[NativeTravelMemoryReference] {\n@@ -1872,6 +1937,18 @@\n               boundScope == initial,\n               conversation != nil || (pending != nil && pending?.conversationId == selection.conversationID) else { return }\n         if let pending, pending.conversationId != selection.conversationID || pending.policyId != policy.id { return }\n+        if session.canonicalPlaceAskNavigation != nil {\n+            canonicalPlaceAskNotice = \"original_submission_unsupported\"\n+            return\n+        }\n+        if session.canonicalPlaceAskPending != nil {\n+            canonicalPlaceAskNotice = \"unknown\"\n+            return\n+        }\n+        if let capture = session.canonicalPlaceAskSelection {\n+            await sendCanonicalPlaceAsk(capture, initial: initial, policyID: policy.id)\n+            return\n+        }\n         if !selectedSources.sources.empty || !selectedMemoryBasis.isEmpty || selectedSources.pending != nil {\n             await sendSelectedSources(initial: initial, policyID: policy.id)\n             return\n@@ -1908,6 +1985,48 @@\n         busy = false\n         await reload(replacing: true)\n     }\n+    private func sendCanonicalPlaceAsk(_ capture: NativeCanonicalPlaceAskCapture, initial: NativeDataScope, policyID: String) async {\n+        guard isActive, scenePhase == .active, pending == nil, selectedSources.pending == nil,\n+              selectedSources.sources.empty, selectedMemoryBasis.isEmpty,\n+              canonicalPlaceAskRoot == currentCanonicalPlaceAskRoot,\n+              capture.current(scope: initial, locale: chinese ? \"zh\" : \"en\"),\n+              let conversation, conversation.conversationId == selection.conversationID else {\n+            canonicalPlaceAskNotice = \"recheck\"; return\n+        }\n+        // Current assistant v5 submission has no compatible Task/Turn admission.\n+        // Never switch to a plain Task sender or manufacture a Task to get a positive result.\n+        canonicalPlaceAskNotice = \"original_submission_unsupported\"\n+    }\n+    private func readCanonicalPlaceAskReceipt() async {\n+        guard !busy, isActive, scenePhase == .active, let initial = session.dataScope,\n+              let retained = session.canonicalPlaceAskPending, retained.scope == initial else { return }\n+        busy = true\n+        defer { busy = false }\n+        do {\n+            let bytes = try await session.readCanonicalPlaceAskReceipt(retained)\n+            await acceptCanonicalPlaceAsk(bytes, pending: retained, initial: initial)\n+        } catch { if session.dataScope == initial { canonicalPlaceAskNotice = \"unknown\" } }\n+    }\n+    private func acceptCanonicalPlaceAsk(_ bytes: Data, pending retained: NativeCanonicalPlaceAskPending, initial: NativeDataScope) async {\n+        guard session.dataScope == initial, !Task.isCancelled else { return }\n+        do {\n+            switch try NativeCanonicalPlaceAskResponse.decode(bytes, pending: retained, expectedDigest: retained.requestDigest) {\n+            case .accepted(let originalReceipt, _):\n+                let accepted = try JSONDecoder().decode(AssistantAccepted.self, from: originalReceipt)\n+                guard accepted.version == 5, accepted.kind == \"accepted\", accepted.conversationId == retained.conversationID,\n+                      accepted.messageId == retained.messageID else { throw NativeDataError.invalidResponse }\n+                try session.acknowledgeCanonicalPlaceAsk(retained, receipt: bytes)\n+                canonicalPlaceAskRoot = nil; canonicalPlaceAskNotice = nil\n+                let submitted = try NativePlaceActionWire.object(retained.submission)\n+                if draft.trimmingCharacters(in: .whitespacesAndNewlines) == submitted[\"text\"] as? String { draft = \"\" }\n+                if selection.conversationID == retained.conversationID { await reload(replacing: true) }\n+            case .unknown: canonicalPlaceAskNotice = \"unknown\"\n+            case .notSubmitted: canonicalPlaceAskNotice = \"not_submitted\"\n+            case .unavailable(let reason): canonicalPlaceAskNotice = reason\n+            }\n+        } catch { canonicalPlaceAskNotice = \"unknown\" }\n+    }\n+\n     private func sendSelectedSources(initial: NativeDataScope, policyID: String) async {\n         let request: NativeSelectedMessageRequest\n         if let retained=selectedSources.pending { request=retained }\n"
```

<a id="payload-15"></a>

## shared-hunks/NativeJournalDataVaultSources.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeJournalDataVaultSources.after.swift.gz`

Byte length: `3623`

SHA256: `391f537bac2e65acdc14164b4f1aa744d22996ac65936aeee4e378c9a801da45`

Encoding: `base64`

```text
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
upaJDmiD9glbLapvZ/8Dqs0yVu9GAAA=
```

<a id="payload-16"></a>

## shared-hunks/NativeJournalDataVaultSources.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeJournalDataVaultSources.before.swift.gz`

Byte length: `3453`

SHA256: `1b7754d8169a976551d379e28c8fab3156b1783f5d42f6b6fb1d096075cea93f`

Encoding: `base64`

```text
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
QwAA
```

<a id="payload-17"></a>

## shared-hunks/NativeJournalDataVaultSources.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeJournalDataVaultSources.patch`

Byte length: `3924`

SHA256: `aff988a3fba68c282e0cea66fe8b1e29d0efe7cc3574619f1c259619d573a695`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataVaultSources.swift\n+++ b/ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataVaultSources.swift\n@@ -11,6 +11,7 @@\n     private let current: () -> NativeCommunitySafetyActor?\n     private let guide: (NativeDataScope) throws -> NativePlaceGuidePending?\n     private let ask: () throws -> NativePendingAsk?\n+    private let canonicalAsk: () throws -> NativeCanonicalPlaceAskDurable?\n     private let askAbsent: (NativeCommunitySafetyActor) throws -> Bool\n     private let companions: [NativeJournalDataSourceID: Companion]\n     private let evidence: (NativeJournalDataSourceID, NativeCommunitySafetyActor) -> NativeJournalDataCompletion?\n@@ -18,10 +19,11 @@\n     init(vault: any NativeCredentialVault, current: @escaping () -> NativeCommunitySafetyActor?,\n          guide: @escaping (NativeDataScope) throws -> NativePlaceGuidePending?,\n          ask: @escaping () throws -> NativePendingAsk?,\n+         canonicalAsk: @escaping () throws -> NativeCanonicalPlaceAskDurable? = { nil },\n          askAbsent: @escaping (NativeCommunitySafetyActor) throws -> Bool,\n          companions: [NativeJournalDataSourceID: Companion],\n          evidence: @escaping (NativeJournalDataSourceID, NativeCommunitySafetyActor) -> NativeJournalDataCompletion?) {\n-        self.vault = vault; self.current = current; self.guide = guide; self.ask = ask\n+        self.vault = vault; self.current = current; self.guide = guide; self.ask = ask; self.canonicalAsk = canonicalAsk\n         self.askAbsent = askAbsent; self.companions = companions; self.evidence = evidence\n     }\n     func completion(source: NativeJournalDataSourceID, actor: NativeCommunitySafetyActor) -> NativeJournalDataCompletion? {\n@@ -218,16 +220,22 @@\n             }\n         }\n         if selected == nil || selected == .ask { do {\n-            try checked(actor); let value = try ask()\n+            try checked(actor); let value = try ask(); let canonical = try canonicalAsk()\n+            guard value == nil || canonical == nil else { throw NativeDataError.invalidResponse }\n             let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]\n             let identity = try value.map { try encoder.encode($0) }\n-            guard try value == ask() else { throw NativeDataError.staleSessionResponse }\n+            guard try value == ask(), try canonical == canonicalAsk() else { throw NativeDataError.staleSessionResponse }\n             try checked(actor)\n             if let value, value.valid, value.mobileEpoch == scope.mobileEpoch, let identity {\n                 var immutable = value; immutable.acknowledged = false\n                 rows.append(.init(record: record(.ask, operation: value.request.idempotencyKey, action: value.mode.rawValue,\n                     boundary: \"credential_envelope_and_user_or_licensed_input_excluded\"), originalIdentity: identity, operationIdentity: try encoder.encode(immutable)))\n-            } else if value == nil { rows.append(empty(.ask, state: .absent)) }\n+            } else if let canonical, canonical.matches(scope) {\n+                let identity = try encoder.encode(canonical)\n+                rows.append(.init(record: record(.ask, operation: try NativeCanonicalPlaceAskPending.restoring(body: canonical.body, scope: scope).operationID,\n+                    action: \"canonical-place-ask/1\", boundary: \"credential_envelope_and_user_or_licensed_input_excluded\"),\n+                    originalIdentity: identity, operationIdentity: identity))\n+            } else if value == nil && canonical == nil { rows.append(empty(.ask, state: .absent)) }\n             else { throw NativeDataError.invalidResponse }\n         } catch { rows.append(empty(.ask, state: .unavailable)) } }\n         for id in [NativeJournalDataSourceID.tripSupport, .deviceDelete, .readinessSave, .linkedTripDelete, .memoryDelete, .tripDelete, .assistantEventsCursor] {\n"
```

<a id="payload-18"></a>

## shared-hunks/NativePlaceActionStore.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionStore.after.swift.gz`

Byte length: `3192`

SHA256: `81004ba200631d6ef335f23f971abe2a3cf1533e4929f0b5a82cdcf791ed0d2f`

Encoding: `base64`

```text
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
```

<a id="payload-19"></a>

## shared-hunks/NativePlaceActionStore.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionStore.before.swift.gz`

Byte length: `3122`

SHA256: `7ce5f55dcf5249af17c5a12e4da8edee41a67382ffc34aa86d53130052302b04`

Encoding: `base64`

```text
H4sIAAAAAAAC/81bbW/bRhL+7l9BC4dCxLFsDgUOB7muokhMoosj6yTZh8IwBFpc2WwoUiUpO4Lr/34z+8ZdcleS7bRXf4m4L7Oz
8/LMzO4mXq2zvHTeZ5s0Css4S49i1nJ+U5D8njUdvf0cxmlvUWa585Z33CTEWcZpmDiLJCwKZwRD78k4CRcEBsKsKYwmzuORA3/3
Ye78mm1yGK7Q7fBJ/2Y9g7AMld7uEZ26zmP4Ju2ClC6ls8jSknwtO80V+6yna56XkwWJ16Z5E9ZjmbcmaRSnt4Z5Y9ZjmVcssjUR
s3BvU2ywDL7ZFFvn1FmGSUHMI9KsjBdAb1rm9jX5HnsgxbTcTW8RpguSJCQyCVL0acvQabckJTnVD5C/uBgO2m5jTETCKIlTYHYW
r8gQlAIqTWD8GxvXK7K6ITmJpuE9MtQuw/yWmFQ1JQmhPzynYGNtVuBTWq6+g4SUzmZdAlewiOt8/7PGIR0ap3HZFmPekmIRrkHe
htGwn0dnnGcLUhTDdJn5a+V3sS1KsrqgZJwnF0YWJFn6jC7M5D+e6JLLTboALyJh3saRBhGfCKuHljROToSixSe3UfFJTU98CG2g
/E80QzvhRlUjqlvPSV09YrQ0INag7iVOQT4x4Anhyjh4X3ZmVfr3cRED/rTnzn5D6Xqwy4eOM0D9n9J/2i5VphU/OGjh3+0mzCNq
Nmwlj/7mTHu80efyPmWC90S/XwgmsI+PXeN6nlyA/fE+cO31MMLBggJrkQvdhAW5JHnBSaqjeHOdMjM0kP9PUrZUIPAtZpOv6zgn
Ra90CMr5ERReAiAzpZ6ILz6akldUARMR59tmtPOgP4yor5V3efZQGOUucNRVBB8vmccw0R5z0QJzwk+eBLcGYzvIsPku8E9ZiS8k
u6IMlqjcq8y3dEu4BrAoOo6ZCzxW67bGZ71+MO/1Z8Pz0XwS9M8vg8kv8OM/F8NJMGgB/9X6i7Bc3NlnT2fnk96HYH4x6l32hme9
d2dBi89WNJFkwNYhwJlkizCRkQSsdZPnIBeBiDtdKSe/bUDjMBZ17DphsYWlK92qrXUvOkZ3lqZMlSYXh6Wli3iO9CfNv3TrrKS3
1wDkSPTd7AHhp8IiWA1WKSmMCWeRyFPmG8UUyJLkaHBLDcpOKcnHGlgp/KEJaV6JbNxk0ZbbU0Pg/wV39G+2JSnaV62QNrU6Tot7
YMtzWuCyoBISzSrHhxFNkIChEoNaHctKFJHaKjy5MI9ZCUxiP67d5haQQ76H8CGMS2EdbdycPp5ZAJW9Lnyj/o9nYfHFjwuZh1h1
X9GWQPe9VOhPzo9vxExqogo8BXme5T43nQkp1lmqQQJ1SxmbjGoSiUZEFllE2lQcniNUI9ThakFNsPZ3YE1bC4wKZVrwCMuX7vq0
gSc7PswuNwVKqkUbWlQk9ejclm5EM6DapqQkDUFdGfokQQk4a+gNcXhX4JbeN0VkpeIhKHBXOoaa+WSrVZgehl3MGyrsisLtMJJJ
MWOGezQENBb1ZTOAdbNRR8OdcarPGG0AmwwPnCQHOiVTgMVEzsKtYrddYhFE8jYKrtMMJR+D/qcqkqgKxmwaLHoDs67YhjpOL91e
w/oKkoRcmC1AVabPYQTNLCXzN5s4YnP9JHsg+QLgBOLdc1CnloOY/16MTIKNz+EaU/NBfAuYAzREPrNS26/VjCKUyRj1H3QfKq0r
SROdYUJQV8DWdeWIzA+7fs77nG7XeaMInmpTX2GT8jUMYGVw9X2e/goc43vMMX4RQFTQNm6NraS0nuyVhpjCmhrjdY1UEzSNKBBj
kFoYRXaRUW+v0mv4LHz8COO0aD/cwT46IKK/vfFjmkTT4VB9MVcUoMC+GBZ8A6nSRehe6S8pkxjqP96x27FMRAWvdPpwev6vf775
B6LW+yxfhSXUn0CuoKTayzxbdeTm3EondIMHE2DDq+k8/ON09rOutucLjeEhg9BTK7q2WcnT0WsijyZMnb35EuXehW3gQL6YL9JD
TOxkNUO7mtUMi4o0JkJ5mWPlyNajTXTRSfbgHVB4uo04YUxr6wmxinY4FlhQ6khbHrQjC/DpiYbi5h1KU2nAtJ55tOhiXzSQAgx1
BAh5jubJbLTW5Lp1kS4zZGMi+bNUii8KvGrdJovvHdG4JiWv3uAb6/nX2DsjCOowr+TJKFDvp+2Keqm+mSpf5SBqQcEj1HMTAXN0
/zNqElvkN0QZG5dqEOw0Q6CyiBb8OrXQd20zdIFiiKr7j5w95//kDZwzZmbTerIhvIXnOqf6cCGU1/jFC8rfF1qrzTDFlnacnTnf
NI0VC+61ZjHwEHvew5tu7YLwQfZeWfpuFFLlWMFQdQKgeAioDZxk1ebBt2M17a7NL6jhZlAadZx3WZbgJ5jQeR7f4k0UaxRnMFAs
3gAtDGpac1OQxgOw6sbmeYeYBvrAJGSoQMC230MIm/jOVmtwJmKizGeplC+zOFJP8EQN/eKTPO3shuONAYSsSYvpOE47erMc433T
gzheLtsEWD+k4fZXI6SXKRm3R+28+JloyRNxICGoWRY81lzA+f332mn3d9+pMUCy9orCRxQAFobqEUdN+1+xqqyOpFTRqQSWuM4P
PziDTU6vpclXiBr8ePKGLPEaurzD2+q8KJ2HHCoz4QW+vjHtqzr0p8ue7LhcrUc2esQU1k2HwxFa6POjH5+M4Y/zDq2UMV+UOdnN
rwDk15YDP2VNYcNgGjXr6dZI8pHbdzAZTLi+IqX59IyDYX26GjJeclzMIed5p8X8oFW9vTSf7ooBtfNd+RyAlZoGN0Dy/LHDLF58
oel/8/FD178hIPRa/U8vA1npSqGdF7SNG97a/S9FXXVL8vchZot/JgaXEOiLu7a2F4+yVzO8Kh9r7uawc2L9jLPfG/WDs7Ng0BIF
+w4/rXA3J8UmsR7X85R7jzql6ehCq0WjxpFsMBzP5r1302A0kzwbPOOlZvE8k2ByaNzQn7D4hX2+6ZzSdiew85L+6A83IqvQz857
g+oY/MCbCxOEqDevh1xYANz8pS5aJa3g6zqBaNcrvnzEaLFcdm2pmylIQ40eF/abCvVVwLe/UTVdMf3hN6qgyD/pNtVW61GZ1yq9
v9jdq2e7WvUalsKfQewyGC3t3qkuls4wnNY3NN85j2Z/DCQ956r1JU7xQKPFkg3xS6hZUyl8aJrABg59VYNaUsvZgJiAbwtS0ClM
rMN0veEzwmj7PsvHeXYfRyTHtvUmX2cF4dbHnt/gxx3z29a1SYX8aJ7u6Bp8v8uRhcI4NbU56G5evRPgE/jW61P080PD+YJZvjFQ
vyV5WyEupHmtWNK+C0G7AqVCxBKVhnALeKHp7ntQpdylrGqXUroQjA7IZ+q6N8/Uxpi4aBtv3wBoR9PRJqEFm0XOkXGq8DJAFQvM
ZVlCwrSaXLM+piTbWYjYuzDQhp3RKmq+BhjYziVj8yxNti0TOXrXxiwcLyWqC0Nu8yp9118mYQkQyY8zPqXZAwDQLZnAHny8wXE9
Sexn/pRPtvil8jhzGgNXI3zmdvrKRyAQm44F29I7K/3ZCgA+9FCkUmkzE1ex6w4ETVEjixnqoFIhASuKOlBUYMHp2eACgYKaBpCT
Qxl9C05QP8MiI0tjiEpjHGs7lZQUFUbrHEC+ekcWyMVvG5BGVOFVw1X4rNecWTQCUIzwvFM9DRzSgF1CUYNywULB4aqvxxDVBMDP
4iWMFYGLRgx0ZBBPy5AY4JgDVuY8MvjWFqzi5B3orkJ2QzziIqwhsSNpS94Vf/Gcau1qH9Q2rvClituF3CNYrcstJQzZojl4xOsD
49qeKMYo6Vs1B7HXmJ92cs6PtmuXwMjtoHGpp0RXc0aKLltNe46P0mfxLCbU5otmTw4YG1ZR+4DTNMQH8ywolnGZEPfwt2Q7qq+T
Zhqp3rmFcdKeO3RwxwnYnJ30tP8OgNfb8UK8QotIgxRUVtyutJfJeLdke7PFjjsjAlbEiKFTDUeXvbPhYD4cjS9m6FsXo97F7GMw
mg37vRlUr9D0/nzybjgYBCP8mM56Z8F8NhmO55fBZAoFL7Z+7o3Hw9GHef9jb/SBzer3pvP++ej92bBPCQ8Hwefx+SwY9X+Zfwrw
wfHFNMAOrXhWXxJ7e98qX1ePbNjOHqtnFBHRXiHQVvtaXH9PR/8DjmJ2z3c0AAA=
```

<a id="payload-20"></a>

## shared-hunks/NativePlaceActionStore.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionStore.patch`

Byte length: `1931`

SHA256: `d9fa977dd9fbf51c51558954803ef654a018f09000cc4350070fb6e5158e5b1c`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionStore.swift\n+++ b/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionStore.swift\n@@ -113,7 +113,7 @@\n             notice = \"PLACE_ACTION_RELOAD_REQUIRED\"\n         } catch { if own == generation, current() == scope { notice = Self.code(error) } }\n     }\n-    func ask(target: NativePlaceActionSelection, locale: String, current: () -> NativePlaceActionSelection?, request: (Data) async throws -> Data) async -> NativeExploreAskHandoff? {\n+    func ask(target: NativePlaceActionSelection, locale: String, current: () -> NativePlaceActionSelection?, capture: ((NativeCanonicalPlaceAskCapture) -> Void)? = nil, request: (Data) async throws -> Data) async -> NativeExploreAskHandoff? {\n         guard !busy, pending == nil, let basis = visible(target) else { return nil }\n         let own = generation, started = uptime(); busy = true\n         defer { if own == generation { busy = false } }\n@@ -140,6 +140,9 @@\n             let trip = try NativePlaceActionWire.exact(sources[\"trip\"] as Any, [\"tripId\", \"headVersion\"])\n             guard input == target.place, sources[\"artifact\"] is NSNull, (sources[\"evidence\"] as? [Any])?.isEmpty == true,\n                   trip[\"tripId\"] as? String == target.tripId, NativePlaceActionWire.integer(trip[\"headVersion\"]) == target.baseVersion else { throw NativeDataError.invalidResponse }\n+            if let capture {\n+                capture(try NativeCanonicalPlaceAskCapture.decode(bytes, context: basis, target: target, locale: locale, started: started))\n+            }\n             return .init(scope: target.scope, tripID: target.tripId, tripVersion: target.baseVersion, poiID: target.place.canonicalPoiId,\n                          provider: target.place.provider, providerPoiID: target.place.providerPoiId, name: basis.title)\n         } catch { if own == generation { notice = Self.code(error) }; return nil }\n"
```

<a id="payload-21"></a>

## shared-hunks/NativePlaceActionsView.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionsView.after.swift.gz`

Byte length: `10885`

SHA256: `8ef98aba8d73b30023dad256cb951669f30c4e543bbd7f466e8be5863b1ea74c`

Encoding: `base64`

```text
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
vwH2ttoFSIsAAA==
```

<a id="payload-22"></a>

## shared-hunks/NativePlaceActionsView.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionsView.before.swift.gz`

Byte length: `10728`

SHA256: `00d3fcfc3713093a101bcaab75dc10f61a49a701c92113dba72ef16eec35b357`

Encoding: `base64`

```text
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
iQAA
```

<a id="payload-23"></a>

## shared-hunks/NativePlaceActionsView.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativePlaceActionsView.patch`

Byte length: `2397`

SHA256: `dcedbfaaec9dd56e2b929a42839165e5e91998c0df594accbe1e2f2edc59b9f8`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\n+++ b/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\n@@ -144,10 +144,19 @@\n             Text(t(\"只保存地点引用，不保存地图供应商正文，也不会加入日程。\", \"Saves a place reference, without storing map supplier content or adding to your schedule.\")).font(.caption)\n             Button(t(\"在同一个 VP 准备提问\", \"Prepare question in the same VP\")) {\n                 run {\n-                    let handoff = await store.ask(target: target, locale: locale, current: { self.target }) { try await session.placeActionRequest(tripId: target.tripId, body: $0, actor: target.scope) }\n-                    if let handoff, self.target == target, scope == target.scope { session.prepareExploreAsk(handoff) }\n-                }\n-            }.disabled(store.busy || store.pending != nil).accessibilityIdentifier(\"explore.place.ask\")\n+                    let language = locale\n+                    var capture: NativeCanonicalPlaceAskCapture?\n+                    let handoff = await store.ask(target: target, locale: language, current: { self.target }, capture: { capture = $0 }) {\n+                        try await session.placeActionRequest(tripId: target.tripId, body: $0, actor: target.scope)\n+                    }\n+                    if handoff != nil, let capture, self.target == target, scope == target.scope, language == locale {\n+                        session.prepareCanonicalPlaceAsk(capture)\n+                    }\n+                }\n+            }.disabled(store.busy || store.pending != nil || session.canonicalPlaceAskRecoveryRequired).accessibilityIdentifier(\"explore.place.ask\")\n+            if session.canonicalPlaceAskRecoveryRequired {\n+                Text(t(\"已有地点提问结果待核，请回 VP 只读取原提问回执。\", \"A place question is unresolved. Return to VP and read its original receipt only.\")).font(.caption)\n+            }\n             Text(t(\"带入同一地点，仍由你明确发送问题；供应商资料与知识使用资格待核。\", \"Prepares the same place for you to send explicitly. Eligibility to use supplier information and knowledge remains unconfirmed.\")).font(.caption)\n             if store.pending != nil || store.busy { Text(pendingExplanation).font(.caption) }\n         }.buttonStyle(.bordered)\n"
```

<a id="payload-24"></a>

## shared-hunks/NativeSession.after.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeSession.after.swift.gz`

Byte length: `29356`

SHA256: `eda7c607ea34971a9b728d4794c1487a2c70d288943b391740b67554a15e02e4`

Encoding: `base64`

```text
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
AAm6SIeJq+A/sl/cloZfm9FqVfxHesc1dfzaZDxKfq1HW8t/ZH1YquY/Coyyaj0/X01Y0c8SBNO2anOSvp7ObPmbklJsmHHaad/m
V4sfWdih4iXHdPasrOSEXa3N1dt7dt9R3LttvhHNvTbx+QV9/aTfOd29O7lvVHnPT4HZq3z4L6Cc13bq7kc5uDSsdqCDRs7qKPyx
lhAMW/IV6dKb/mGtMzZIgU2Lb17FLGmZnhXemppXEauOnP+K+3fSyQYJy9qVsrdCrO/Vsvdq2dtTy3Iacq+XvdfL3utl7/Wy93rZ
b0ove3T8+vnhi4N7xey9YvZeMesoZm25VtfM2u9WqprVnY9c/eye9+1tKWntua1WU7vn9F5TXWtPy6Oztfu2Fbd7vi5Ktbd7ZYOu
WoWrr3CeZC4hkDo60EDDr6wIXcFVaw+wsBbJD6d51UhclvUV890JlZM0k18oim7VmKQGcLX+8Yf85Aol/vKPqMnAVmGw3QtUeeza
5S1LUmQt7evpA4XpoKmtLujEiVAx1udz0aTLdQ4PyS/qwgl3b7liLjNIHbdXXTtoXmxszF3x0cE1oF2xN8sLOJKmk3F8cSGkHx3M
3QD4tUqU/tMR9Astv0/+tTWRzk1+u+pIe/j5dZKBBdwrJu8Vk18/ybBCzXvt5L128l47ea+dvNdOfmOZgl+9PTg+WbSc2L2K8l5F
+a+uorQZcEdP6W2wukQRpGbK+1d85h6126721tK47VoflirbdgOjrFrPxldTkRNBW/O/k8SqbUK1sPoJWTiUVlcrtmpzmF9idRdw
L6zeC6tfW1jl1OReTr2XU+/l1Hs59V5O/abk1N3jvd8O39570dyLqPciqiuiahy3I53a71YsmIpCg0CbLuE2LUhuNFw+PA0qXD58
Xa7QycPsvkIKtZv/exlPzbVXyKPB8C+9uqj2Uoiqteyo5kzKpVKWtKtbvoiO0fheGL0XRr9CedaNCUfKe4n0XiK9l0jvJdJ7ifSb
q7F6dPz61+ODk5NvXTYNs30ei5engStY1BQhxtk0veC3QsDA9cpuYlm5Xvm6KBUyXpUNump7l73CCpHDbv7vJHLY+3I7Ioe6hn0J
QOw5+YQPI4GH7z7QUzWUCw/ixb0QUS5E6DMyhYp/DyFCJxO3a9Z6Wio9OHO4FyLuhYh7IeJeiLgXImwh4tXr08PnguPf3z3d/Vcw
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
```

<a id="payload-25"></a>

## shared-hunks/NativeSession.before.swift.gz

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeSession.before.swift.gz`

Byte length: `27096`

SHA256: `bca14b8c1d99cfaa5951f92d7a00fe8d58ec3f137897f28294654244dac078c2`

Encoding: `base64`

```text
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
MpWtXgnw7v2CwsT/AyqBhwfU6wIA
```

<a id="payload-26"></a>

## shared-hunks/NativeSession.patch

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/NativeSession.patch`

Byte length: `23008`

SHA256: `20cf1546d918b35c66e7bdac2c16fc23e2f0644e8ad94ed71962e2ca4858e1fe`

Encoding: `utf8-json-string`

```json
"--- a/ios/VisePanda/VisePanda/App/NativeSession.swift\n+++ b/ios/VisePanda/VisePanda/App/NativeSession.swift\n@@ -20,6 +20,7 @@\n     var attemptId: String\n     var mobileEpoch: Int?\n     var pendingAsk: NativePendingAsk? = nil\n+    var canonicalPlaceAsk: NativeCanonicalPlaceAskDurable? = nil\n }\n \n @MainActor\n@@ -48,6 +49,14 @@\n     let offlineTrips=NativeOfflineTripStore()\n     let deviceMaterials: NativeDeviceMaterials\n     private(set) var exploreAskHandoff:NativeExploreAskHandoff?\n+    private(set) var canonicalPlaceAskReferenceGeneration = UUID()\n+    private(set) var canonicalPlaceAskNavigation: NativeCanonicalPlaceAskCapture?\n+    private(set) var canonicalPlaceAskSelection: NativeCanonicalPlaceAskCapture?\n+    var canonicalPlaceAskPending: NativeCanonicalPlaceAskPending? {\n+        guard let scope = dataScope, let stored = credential?.canonicalPlaceAsk, stored.matches(scope) else { return nil }\n+        return try? NativeCanonicalPlaceAskPending.restoring(body: stored.body, scope: scope)\n+    }\n+    var canonicalPlaceAskRecoveryRequired: Bool { credential?.canonicalPlaceAsk != nil }\n     private var deviceMaterialSignOutFence = false\n     private var credential: NativeCredential?\n     private let endpoint: URL?\n@@ -129,11 +138,18 @@\n                 let physical = try self.read(owner: actor.scope.subject)\n                 guard physical.mobileEpoch == actor.scope.mobileEpoch, physical.pendingAsk == pending else { throw NativeDataError.staleSessionResponse }\n                 return pending\n+            }, canonicalAsk: {\n+                guard let actor = try? self.communitySafetyActor(), let memory = self.credential else { throw NativeDataError.sessionUnavailable }\n+                let physical = try self.read(owner: actor.scope.subject)\n+                guard physical.canonicalPlaceAsk == memory.canonicalPlaceAsk,\n+                      physical.mobileEpoch == actor.scope.mobileEpoch else { throw NativeDataError.staleSessionResponse }\n+                return physical.canonicalPlaceAsk\n             }, askAbsent: { actor in\n                 guard try self.communitySafetyActor() == actor else { throw NativeDataError.staleSessionResponse }\n                 let physical = try self.read(owner: actor.scope.subject)\n                 let memoryPending = try self.retainedPendingAsk()\n                 return physical.mobileEpoch == actor.scope.mobileEpoch && physical.pendingAsk == nil && memoryPending == nil\n+                    && physical.canonicalPlaceAsk == nil && self.credential?.canonicalPlaceAsk == nil\n             }, companions: companions,\n             evidence: { self.journalDataEvidence.completion($0, current: (try? self.communitySafetyActor()) == $1 ? $1 : nil) })\n     }\n@@ -169,9 +185,142 @@\n     }\n \n     func prepareExploreAsk(_ handoff:NativeExploreAskHandoff) {\n-        guard handoff.scope==dataScope,handoff.valid else{return};exploreAskHandoff=handoff\n-    }\n-    func clearExploreAsk(){exploreAskHandoff=nil}\n+        guard handoff.scope==dataScope,handoff.valid else{return};canonicalPlaceAskReferenceGeneration=UUID();canonicalPlaceAskNavigation=nil;exploreAskHandoff=handoff\n+    }\n+    func clearExploreAsk(){exploreAskHandoff=nil; canonicalPlaceAskNavigation=nil; canonicalPlaceAskReferenceGeneration=UUID()}\n+    func invalidateCanonicalPlaceAskReference() { canonicalPlaceAskReferenceGeneration = UUID() }\n+\n+    // Typed navigation only. No automatic message, Goal, Task or provider eligibility.\n+    func prepareCanonicalPlaceAsk(_ capture: NativeCanonicalPlaceAskCapture) {\n+        guard canonicalPlaceAskPending == nil, capture.current(scope: dataScope, locale: capture.expectation.locale) else { return }\n+        let expected = capture.expectation\n+        canonicalPlaceAskReferenceGeneration = UUID()\n+        canonicalPlaceAskNavigation = capture\n+        exploreAskHandoff = .init(scope: capture.scope, tripID: expected.tripId, tripVersion: expected.headVersion,\n+                                 poiID: expected.selection.canonicalPoiId, provider: expected.selection.provider,\n+                                 providerPoiID: expected.selection.providerPoiId, name: capture.title)\n+    }\n+    func recheckCanonicalPlaceAsk(_ original: NativeCanonicalPlaceAskCapture, locale: String) async throws -> NativeCanonicalPlaceAskRefresh {\n+        guard let scope = dataScope, original.scope == scope, !canonicalPlaceAskRecoveryRequired,\n+              [\"zh\", \"en\"].contains(locale) else { throw NativeDataError.staleSessionResponse }\n+        guard original == canonicalPlaceAskNavigation || original == canonicalPlaceAskSelection else { throw NativeDataError.staleSessionResponse }\n+        let generation = canonicalPlaceAskReferenceGeneration\n+        let expected = original.expectation\n+        let target = NativePlaceActionSelection(scope: scope, place: expected.selection, tripId: expected.tripId, baseVersion: expected.headVersion)\n+        let started = ProcessInfo.processInfo.systemUptime\n+        let contextBytes = try await placeActionRequest(tripId: target.tripId, body: NativePlaceActionWire.bytes([\n+            \"action\": \"context\", \"expectedTripVersion\": target.baseVersion,\n+            \"selection\": NativePlaceActionWire.place(target.place), \"locale\": locale]), actor: scope)\n+        guard dataScope == scope, !Task.isCancelled, canonicalPlaceAskReferenceGeneration == generation,\n+              original == canonicalPlaceAskNavigation || original == canonicalPlaceAskSelection else { throw NativeDataError.staleSessionResponse }\n+        let context = try NativePlaceActionContext.decode(contextBytes, expected: target)\n+        let bytes = try await placeActionRequest(tripId: target.tripId, body: NativePlaceActionWire.bytes([\n+            \"action\": \"ask\", \"expectedTripVersion\": target.baseVersion, \"selection\": NativePlaceActionWire.place(target.place),\n+            \"expectedMappingDigest\": context.mappingDigest, \"locale\": locale]), actor: scope)\n+        guard dataScope == scope, !Task.isCancelled, canonicalPlaceAskReferenceGeneration == generation,\n+              original == canonicalPlaceAskNavigation || original == canonicalPlaceAskSelection else { throw NativeDataError.staleSessionResponse }\n+        return .init(original: original, capture: try NativeCanonicalPlaceAskCapture.decode(bytes, context: context, target: target, locale: locale, started: started), generation: generation)\n+    }\n+    @discardableResult func stageCanonicalPlaceAskRefresh(_ refresh: NativeCanonicalPlaceAskRefresh) -> Bool {\n+        guard refresh.generation == canonicalPlaceAskReferenceGeneration,\n+              refresh.original == canonicalPlaceAskNavigation || refresh.original == canonicalPlaceAskSelection,\n+              refresh.original.scope == dataScope,\n+              refresh.original.expectation.selection == refresh.capture.expectation.selection,\n+              refresh.original.expectation.tripId == refresh.capture.expectation.tripId,\n+              refresh.original.expectation.headVersion == refresh.capture.expectation.headVersion,\n+              !canonicalPlaceAskRecoveryRequired else { return false }\n+        prepareCanonicalPlaceAsk(refresh.capture)\n+        return canonicalPlaceAskNavigation == refresh.capture\n+    }\n+    // A historical server proof names an exact reference to reread. It does not create current eligibility.\n+    func recheckCanonicalPlaceAskHistory(_ proof: NativeCanonicalPlaceHistoryProof, locale: String) async throws -> NativeCanonicalPlaceAskHistoryRefresh {\n+        guard let scope = dataScope, !canonicalPlaceAskRecoveryRequired, [\"zh\", \"en\"].contains(locale) else { throw NativeDataError.staleSessionResponse }\n+        let generation = canonicalPlaceAskReferenceGeneration, expected = proof.expectation\n+        let target = NativePlaceActionSelection(scope: scope, place: expected.selection, tripId: expected.tripId, baseVersion: expected.headVersion)\n+        let started = ProcessInfo.processInfo.systemUptime\n+        let contextBytes = try await placeActionRequest(tripId: target.tripId, body: NativePlaceActionWire.bytes([\n+            \"action\": \"context\", \"expectedTripVersion\": target.baseVersion, \"selection\": NativePlaceActionWire.place(target.place), \"locale\": locale]), actor: scope)\n+        guard dataScope == scope, canonicalPlaceAskReferenceGeneration == generation, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }\n+        let context = try NativePlaceActionContext.decode(contextBytes, expected: target)\n+        let bytes = try await placeActionRequest(tripId: target.tripId, body: NativePlaceActionWire.bytes([\n+            \"action\": \"ask\", \"expectedTripVersion\": target.baseVersion, \"selection\": NativePlaceActionWire.place(target.place),\n+            \"expectedMappingDigest\": context.mappingDigest, \"locale\": locale]), actor: scope)\n+        guard dataScope == scope, canonicalPlaceAskReferenceGeneration == generation, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }\n+        return .init(capture: try NativeCanonicalPlaceAskCapture.decode(bytes, context: context, target: target, locale: locale, started: started),\n+                     generation: generation, operationID: proof.operationID, requestDigest: proof.requestDigest)\n+    }\n+    @discardableResult func stageCanonicalPlaceAskHistoryRefresh(_ refreshed: NativeCanonicalPlaceAskHistoryRefresh) -> Bool {\n+        guard canonicalPlaceAskReferenceGeneration == refreshed.generation, refreshed.capture.scope == dataScope,\n+              !canonicalPlaceAskRecoveryRequired else { return false }\n+        prepareCanonicalPlaceAsk(refreshed.capture)\n+        return canonicalPlaceAskNavigation == refreshed.capture\n+    }\n+    func adoptCanonicalPlaceAsk(navigationID: UUID, locale: String) throws {\n+        guard canonicalPlaceAskPending == nil, let navigation = exploreAskHandoff, navigation.id == navigationID,\n+              let capture = canonicalPlaceAskNavigation, capture.current(scope: dataScope, locale: locale),\n+              capture.scope == navigation.scope, capture.expectation.tripId == navigation.tripID,\n+              capture.expectation.headVersion == navigation.tripVersion,\n+              capture.expectation.selection.canonicalPoiId == navigation.poiID,\n+              capture.expectation.selection.provider == navigation.provider,\n+              capture.expectation.selection.providerPoiId == navigation.providerPoiID else { throw NativeDataError.staleSessionResponse }\n+        canonicalPlaceAskSelection = capture\n+        clearExploreAsk()\n+    }\n+    func discardCanonicalPlaceAskSelection() { if canonicalPlaceAskPending == nil { canonicalPlaceAskSelection = nil; canonicalPlaceAskReferenceGeneration = UUID() } }\n+\n+    func retainCanonicalPlaceAsk(_ pending: NativeCanonicalPlaceAskPending, policy: NativeTextPolicy) throws {\n+        guard askMode == .serviceTask, let capture = canonicalPlaceAskSelection, pending.scope == dataScope,\n+              capture.current(scope: dataScope, locale: pending.expectation.locale),\n+              capture.expectation == pending.expectation,\n+              var updated = credential, updated.subject == pending.scope.subject,\n+              updated.mobileEpoch == pending.scope.mobileEpoch, updated.pendingAsk == nil else { throw NativeDataError.staleSessionResponse }\n+        let stored = try NativeCanonicalPlaceAskDurable(pending: pending, policy: policy)\n+        if let existing = updated.canonicalPlaceAsk {\n+            guard existing == stored else { throw NativeDataError.staleSessionResponse }\n+            return\n+        }\n+        updated.canonicalPlaceAsk = stored\n+        try save(updated) // The existing Root Keychain write precedes the only POST.\n+        credential = updated // A failed physical readback cannot make a durable request look absent.\n+        let physical = try read(owner: updated.subject)\n+        guard physical.canonicalPlaceAsk == stored, physical.pendingAsk == nil else { throw NativeDataError.staleSessionResponse }\n+        credential = updated\n+    }\n+    func canonicalPlaceAskRequest(_ pending: NativeCanonicalPlaceAskPending, beforeSend: @escaping () -> Bool) async throws -> Data {\n+        guard askMode == .serviceTask, pending.scope == dataScope, canonicalPlaceAskPending == pending,\n+              let stored = credential?.canonicalPlaceAsk, stored.matches(pending.scope),\n+              try read(owner: pending.scope.subject).canonicalPlaceAsk == stored,\n+              let capture = canonicalPlaceAskSelection, capture.expectation == pending.expectation,\n+              capture.current(scope: dataScope, locale: pending.expectation.locale) else { throw NativeDataError.staleSessionResponse }\n+        let generation = canonicalPlaceAskReferenceGeneration\n+        let path = \"api/chat/native/v7/place-ask\"\n+        return try await dataRequest(prefix: path, path: path, method: \"POST\", body: pending.body, beforeSend: {\n+            self.dataScope == pending.scope && self.canonicalPlaceAskPending == pending\n+                && self.canonicalPlaceAskReferenceGeneration == generation\n+                && self.canonicalPlaceAskSelection == capture\n+                && capture.current(scope: self.dataScope, locale: pending.expectation.locale) && beforeSend()\n+        })\n+    }\n+    func readCanonicalPlaceAskReceipt(_ pending: NativeCanonicalPlaceAskPending) async throws -> Data {\n+        guard pending.scope == dataScope, canonicalPlaceAskPending == pending else { throw NativeDataError.staleSessionResponse }\n+        let path = \"api/chat/native/v7/place-ask\"\n+        var query = [URLQueryItem(name: \"operationId\", value: pending.operationID),\n+                     URLQueryItem(name: \"scopeKind\", value: pending.scopeKind),\n+                     URLQueryItem(name: \"scopeId\", value: pending.scopeID)]\n+        if let message = pending.messageID { query.append(.init(name: \"messageId\", value: message)) }\n+        if let turn = pending.turnID { query.append(.init(name: \"turnId\", value: turn)) }\n+        return try await dataRequest(prefix: path, path: path, method: \"GET\", queryItems: query)\n+    }\n+    func acknowledgeCanonicalPlaceAsk(_ pending: NativeCanonicalPlaceAskPending, receipt: Data) throws {\n+        guard case .accepted = try NativeCanonicalPlaceAskResponse.decode(receipt, pending: pending, expectedDigest: pending.requestDigest) else { throw NativeDataError.invalidResponse }\n+        guard pending.scope == dataScope, canonicalPlaceAskPending == pending else { throw NativeDataError.staleSessionResponse }\n+        guard var updated = credential, updated.canonicalPlaceAsk?.body == pending.body else { throw NativeDataError.staleSessionResponse }\n+        updated.canonicalPlaceAsk = nil\n+        try save(updated)\n+        guard try read(owner: updated.subject).canonicalPlaceAsk == nil else { throw NativeDataError.staleSessionResponse }\n+        credential = updated; canonicalPlaceAskSelection = nil\n+    }\n+\n \n     // Navigation pointers only; no conversation, result or Memory content cache.\n     func assistantNavigationSelection() -> NativeAssistantNavigation? {\n@@ -231,7 +380,7 @@\n     }\n \n     func retainPendingAsk(_ request: NativeTextSubmission, policy: NativeTextPolicy, mode: NativeAskMode) throws -> NativePendingAsk {\n-        guard dataScope != nil, mode == askMode, policy.valid, policy.consentState == .accepted,\n+        guard credential?.canonicalPlaceAsk == nil, dataScope != nil, mode == askMode, policy.valid, policy.consentState == .accepted,\n               request.policyId == policy.id, var updated = credential, let epoch = updated.mobileEpoch else { throw NativeDataError.sessionUnavailable }\n         let pending = NativePendingAsk(schemaVersion: 1, mobileEpoch: epoch, mode: mode,\n                                        noticeVersion: policy.noticeVersion, noticeHash: policy.noticeHash, request: request)\n@@ -1869,6 +2018,7 @@\n     func askRequest(path: String, method: String, body: Data? = nil) async throws -> Data {\n         guard askMode != .unavailable else { throw NativeDataError.invalidResponse }\n         let prefix = Self.askRequestPrefix(mode: askMode, path: path, method: method)\n+        guard !prefix.isEmpty else { throw NativeDataError.invalidResponse }\n         let data = try await dataRequest(prefix: prefix, path: path, method: method, body: body)\n         guard data.count <= 1_000_000 else { throw NativeDataError.invalidResponse }\n         return data\n@@ -1879,6 +2029,13 @@\n         let cancelID = path.hasPrefix(cancelPrefix) && path.hasSuffix(\"/cancel\")\n             ? String(path.dropFirst(cancelPrefix.count).dropLast(\"/cancel\".count)) : \"\"\n         let cancellation = method == \"POST\" && UUID(uuidString: cancelID) != nil\n+        if mode == .serviceTask {\n+            if path == \"api/chat/native/v2/turns\", [\"GET\", \"POST\"].contains(method) { return \"api/chat/native/v2\" }\n+            if path == \"api/chat/native/v1/policy\" && method == \"GET\"\n+                || path == \"api/chat/native/v1/consent\" && [\"POST\", \"DELETE\"].contains(method)\n+                || cancellation { return \"api/chat/native/v1\" }\n+            return \"\" // Fail before URLSession for every other path/method in this explicit mode.\n+        }\n         let assistantTaskHistory = mode == .assistant && method == \"GET\" && path == \"api/chat/native/v2/turns\"\n         return (mode.usesTask || mode == .assistant) && cancellation ? \"api/chat/native/v1\"\n             : assistantTaskHistory ? \"api/chat/native/v2\" : mode.base\n@@ -1966,7 +2123,7 @@\n         return data\n     }\n \n-    private func dataRequest(prefix: String, path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {\n+    private func dataRequest(prefix: String, path: String, method: String, body: Data? = nil, queryItems: [URLQueryItem] = [], beforeSend: (() -> Bool)? = nil) async throws -> Data {\n         guard enabled, !busy, let initial = dataScope else { throw NativeDataError.sessionUnavailable }\n         let directionsProjection = path.hasPrefix(\"api/chat/native/v5/planning/directions/\")\n         let guardsTurnProjection = directionsProjection || method == \"GET\" && path.hasPrefix(\"api/chat/native/\")\n@@ -2007,6 +2164,7 @@\n         request.httpBody = body\n         request.setValue(\"application/json\", forHTTPHeaderField: \"Content-Type\")\n         request.setValue(\"Bearer \\(credential.accessToken)\", forHTTPHeaderField: \"Authorization\")\n+        guard beforeSend?() ?? true else { throw NativeDataError.staleSessionResponse }\n         let (data, response) = try await transport.data(for: request)\n         guard dataScope == initial else { throw NativeDataError.staleSessionResponse }\n         guard let http = response as? HTTPURLResponse else { throw NativeDataError.invalidResponse }\n@@ -2243,6 +2401,7 @@\n                 try ensureCurrent(generation)\n                 let state = try JSONDecoder().decode(SessionReply.self, from: data)\n                 guard state.subject == existing.subject else { throw SessionError.invalid }\n+                guard existing.canonicalPlaceAsk == nil || state.mobileEpoch == existing.mobileEpoch else { throw SessionError.denied }\n                 var updated = existing\n                 updated.mobileEpoch = state.mobileEpoch\n                 credential = updated\n@@ -2318,7 +2477,8 @@\n \n     private func accept(_ reply: TokenReply, attempt: String) throws {\n         let retained = credential?.subject == reply.subject && credential?.mobileEpoch == reply.mobileEpoch ? credential?.pendingAsk : nil\n-        let value = NativeCredential(subject: reply.subject, accessToken: reply.accessToken, refreshToken: reply.refreshToken, expiresAt: reply.expiresAt, attemptId: attempt, mobileEpoch: reply.mobileEpoch, pendingAsk: retained)\n+        let canonical = credential?.subject == reply.subject && credential?.mobileEpoch == reply.mobileEpoch ? credential?.canonicalPlaceAsk : nil\n+        let value = NativeCredential(subject: reply.subject, accessToken: reply.accessToken, refreshToken: reply.refreshToken, expiresAt: reply.expiresAt, attemptId: attempt, mobileEpoch: reply.mobileEpoch, pendingAsk: retained, canonicalPlaceAsk: canonical)\n         try save(value)\n         credential = value\n         subject = value.subject\n@@ -2379,7 +2539,11 @@\n         guard let data = bytes, data.count <= 64_000 else { throw SessionError.storage(errSecDecode) }\n         let value = try JSONDecoder().decode(NativeCredential.self, from: data)\n         guard value.subject == owner,\n-              value.pendingAsk == nil || (value.pendingAsk?.valid == true && value.pendingAsk?.mobileEpoch == value.mobileEpoch) else { throw SessionError.storage(errSecDecode) }\n+              value.pendingAsk == nil || (value.pendingAsk?.valid == true && value.pendingAsk?.mobileEpoch == value.mobileEpoch),\n+              value.pendingAsk == nil || value.canonicalPlaceAsk == nil,\n+              value.canonicalPlaceAsk == nil || (value.canonicalPlaceAsk?.valid == true\n+                  && value.canonicalPlaceAsk?.subject == owner && value.canonicalPlaceAsk?.mobileEpoch == value.mobileEpoch\n+                  && value.canonicalPlaceAsk?.endpoint == endpoint?.absoluteString) else { throw SessionError.storage(errSecDecode) }\n         return value\n     }\n     @discardableResult func prepareDeviceMaterials() -> Bool {\n@@ -2407,6 +2571,14 @@\n     }\n \n     @discardableResult private func clear(preservePendingJournals: Bool = false, preservingAnonymousResume: UUID? = nil) -> Bool {\n+        // Canonical unknown requests remain in the original Root item on transient auth loss.\n+        // No old credential authorizes I/O: local actor and projections are fenced immediately.\n+        if preservePendingJournals, credential?.canonicalPlaceAsk != nil {\n+            dataGeneration += 1; subject = nil; mobileEpoch = nil; displayName = nil\n+            exploreAskHandoff = nil; canonicalPlaceAskNavigation = nil; canonicalPlaceAskSelection = nil; canonicalPlaceAskReferenceGeneration = UUID()\n+            failureCode = \"canonicalPlaceAskRecoveryRequired\"; status = \"storageError\"\n+            return false\n+        }\n         // Fence consumers before cleanup; a locked file is not proof of erasure.\n         dataGeneration += 1\n         assistantEventsInvalidation = nil\n@@ -2458,7 +2630,7 @@\n         profileDataErasure=nil; profileDataProjectionFence.bind(nil)\n         conversationDataErasure=nil\n         memoryPreferences.clear()\n-        exploreAskHandoff=nil\n+        exploreAskHandoff=nil; canonicalPlaceAskNavigation=nil; canonicalPlaceAskSelection=nil; canonicalPlaceAskReferenceGeneration=UUID()\n         if let owner = credential?.subject ?? defaults.string(forKey: storageKey) ?? defaults.string(forKey: storageKey + \".pendingJournalCleanupOwner\") ?? defaults.string(forKey: storageKey + \".recoveryCleanupOwner\") {\n             do { try eraseAssistantEventsCursor(owner: owner) }\n             catch { failureCode=\"assistantEventsCursorCleanupRequired\";status=\"storageError\";return false }\n"
```

<a id="payload-27"></a>

## shared-hunks/manifest.json

Original path: `artifacts/IOS-003/canonical-ask-20261015/shared-hunks/manifest.json`

Byte length: `1858`

SHA256: `4b19118a1c817e7868cd1a0d82815f830e91c6c85c38320bfd749909cadda05d`

Encoding: `utf8-json-string`

```json
"[\n  {\n    \"path\": \"ios/VisePanda/VisePanda/App/NativeSession.swift\",\n    \"beforeSHA256\": \"48151cbc6906277953f497c99da835786b8619368666987f98c3ce5ec84e497e\",\n    \"afterSHA256\": \"7c4627a7f25ec82c6d5dd6a2155edb76df449d6b42026aedcb9075b1b182b1da\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift\",\n    \"beforeSHA256\": \"d3d49c5cf65b8267833008ae7e00b8a367b672b84b44362b430a07a0a5563078\",\n    \"afterSHA256\": \"9d6ab2be036bbbdcb51f2b54a707a0c00292be709290c4d390be2dbfc1e64fd8\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift\",\n    \"beforeSHA256\": \"12008229bba6ada4100027747e71253fabeb52eafac82a60269977452311396b\",\n    \"afterSHA256\": \"6e28c02350d9ac6fc5dde9b231f314bc4503159fe1048e09078f458059bed947\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift\",\n    \"beforeSHA256\": \"f406ba40c689ac23a74a912047dd6babb0fd37d1ff744334c9b227512e88fcd6\",\n    \"afterSHA256\": \"0bebc4ccefba5df10da60c28018a15f5e6a919ed1f4f976ac315c2072c1c53b5\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/JournalData/NativeJournalDataVaultSources.swift\",\n    \"beforeSHA256\": \"92f978e2e14b3cec82e286445c9480a752b699af31977128640a0ae23a986738\",\n    \"afterSHA256\": \"d0d48d13447a063336d130ef72207ac2fc28d41e964d375780fac00c0fe6041a\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionStore.swift\",\n    \"beforeSHA256\": \"4d9e4f109658dc0e0bfd6f3c31132c7067c1f6d06b4c365ca6f1623c5bca7462\",\n    \"afterSHA256\": \"2e7b85dfe8d359ed3f461651cc60e958d11ac62f42c9b5432ddfa1cbd5480cf5\"\n  },\n  {\n    \"path\": \"ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\",\n    \"beforeSHA256\": \"745476f1fd604c76f679cd679c8525c1b6fcfa443a13821a77e77ec6840b873c\",\n    \"afterSHA256\": \"a4bd5773baaf42aaf8042c5edd10f8a0958770e70c2f06a823b3765cf2cd6c64\"\n  }\n]\n"
```

<a id="payload-28"></a>

## sync-shadow.py

Original path: `artifacts/IOS-003/canonical-ask-20261015/sync-shadow.py`

Byte length: `1165`

SHA256: `2d24794d71e6fde3612f345f2770d97887ed57774af65040df91264b3c6322ab`

Encoding: `utf8-json-string`

```json
"from pathlib import Path\nimport subprocess,shutil,hashlib,json\nroot=Path.cwd();metadata=Path('artifacts/IOS-003/canonical-ask-20261015/shadow-run.json');v=json.loads(metadata.read_text());shadow=Path(v['shadow'])\nchanged=subprocess.check_output(['git','diff','--name-only','HEAD'],text=True).splitlines()\nnew=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()\nfiles=sorted(set(changed+new+v['workingSourceFilesCopied']))\nfor relative in files:\n src=root/relative\n if src.is_file():\n  dst=shadow/relative;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)\nmode=Path('ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift')\nassert hashlib.sha256((root/mode).read_bytes()).hexdigest()==v['modelsOriginalSHA256']\nassert hashlib.sha256((shadow/mode).read_bytes()).hexdigest()==v['modelsCandidateSHA256']\nv['workingSourceFilesCopied']=files\nv['sourceSHA256']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files if (root/p).is_file()}\nmetadata.write_text(json.dumps(v,indent=2)+'\\n');print('Shadow synchronized; product Models remains original, candidate-only Models hash unchanged')\n"
```
