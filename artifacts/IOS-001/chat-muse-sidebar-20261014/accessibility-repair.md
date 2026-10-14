# IOS-008 / #233 sidebar maximum Dynamic Type repair

Original owner / WT / branch retained. Starting HEAD `78400aa8` was clean. Main supplied exact accepted QA baseline `b993da2b18cf374b8b1e7c05834aee21889ea72d`; normal merge `e0207ec2` preserves that entire tree byte-for-byte. Squash-history conflicts in six old shared/Chat/test files were resolved exclusively to that accepted baseline, without hand edits. Two fetch attempts failed with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`; the exact commit was already available locally, not inferred from a stale branch name.

Main's supplied before image was actually viewed at `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/ios-continuity-main-20261014/artifacts/IOS-008/continuity-20261014/sidebar-max-font-before.jpg`. At accessibility-extra-extra-extra-large, the boundary heading is ellipsized and the fixed boundary occupies most available space above the history scroll area.

The repair moves the complete unchanged local-history notice into the history ScrollView, preserving 20-point spacing before the rows. Heading and row selection text explicitly allow full vertical wrapping. Close/new remain outside the scroller; 320-point maximum width, fonts, colors, titles, IDs, selection logic and synchronous action → onClose ordering are unchanged. No font reduction or removed local-service boundary.

- PASS: `xcrun swiftc -parse ios/VisePanda/VisePanda/Features/Frontend/ChatSidebar/NativeMuseChatSidebarView.swift`.
- PASS: `git diff --check` and source diff inspection; only owned leaf layout and this artifact differ from exact QA baseline.
- UNRUN here: SDK/App build, maximum-size scrolling/readability, normal-size visual comparison and VoiceOver runtime. Main owns those integrated checks and its simulator/resources; no borrowed resources or mirror tests.
- Main separately owns drawer modal focus isolation in Chat/root. This leaf repair does not claim to fix that issue or overall #233 acceptance.

Risk: intrinsic-height layout at maximum Dynamic Type still requires Main's actual target screenshot/scroll verification. Existing state behavior evidence remains applicable because no state/action code changes.
