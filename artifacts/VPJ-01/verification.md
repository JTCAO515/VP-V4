# VPJ-01 native verification

Xcode26.6 / iOS26.5 Simulator, iPhone17Pro. Deployment target iOS17. Source review at
b11cdd6 against main51879c3: independent agent reports Critical0 / Important0, including
all source, project/scheme and test code. Parent #188 remains open.

- PASS generic Simulator build (command-level DEVELOPER_DIR, no global xcode-select change).
- PASS 8 native unit tests: navigation/default, release selection, three legacy selections,
  locale overrides/RTL and preview maturity.
- PASS 5 UI paths across the full run and affected Chinese rerun: English tabs/Today/translation
  title and summary; Chinese tabs/picker → English title with draft retained and send disabled;
  Ask, Tools and Today at maximum accessibility text size.
- AX audit covers element detection, traits, descriptions and clipping only. It is not full
  contrast, hit-region or spoken VoiceOver/device acceptance.
- PASS docs check and diff check; final PR CI is independently required.

Failures were fixed, not waived: dynamic localization keys rendered literally; navigation titles
stayed Chinese after changing language; large tool labels were compressed; the keyboard obscured
tabs without a reliable dismissal control. Final code selects the actual locale resource bundle,
keeps navigation/draft identity, gives large labels full width, and offers a system Done button.
The last full native run passed 8 unit / 4 UI and failed the Chinese keyboard test; its affected
rerun passed after the Done fix. Earlier failures and exact commands are retained in commands.jsonl.
Xcode emitted a nonfatal diagnostic-collection warning about child xcrun's default tool path;
actual build/test outcomes above came from xcodebuild and xcresult, not that diagnostic helper.

Screenshots from actual successful Simulator tests:

- [English Ask](screenshots/ask-en.png)
- [Chinese Ask](screenshots/ask-zh.png)
- [Tools accessibility XXXL](screenshots/tools-accessibility-xxxl.png)
- [Today accessibility XXXL](screenshots/today-accessibility-xxxl.png)

Original user worktree was never modified. No credentials copied into the project, no backend,
Trip write, signing, migration or production publication performed. Merge remains subject to
OA-VPJ-MERGE-DEPLOY; preview/CI is not production acceptance. Rollback is a normal revert.
