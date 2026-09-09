# VPJ-01 native foundation v1

Related to #188. Class A repository foundation, not full Issue acceptance.

Audited port of local IOS-01: explicit Xcode project, iOS17 minimum, Swift6,
Observation, one NavigationStack per stable Trip/Explore/Ask/Tools/Profile tab.
Ask is the default. Today is a Trip route; Tools links to correctly typed unavailable capabilities.
No service, account, persistence, data export or proposal writer is introduced.

Release selection is zh-Hans/en. An explicitly selected legacy locale remains visible in its
picker until the user switches to a release language. SupportedLocale retains es/ru/ar raw values and RTL for
explicit legacy/QA inputs; existing string resources remain. Web wire locales are unchanged,
and the Web release selector migration is still outstanding. Launch override is not persisted.

## Native UI contract

Use system semantic fonts and Dynamic Type, 44pt actions, scrolling content, native navigation
and labels. Brand foreground adapts in dark mode; white-on-plum action fill stays separate.
Grouped backgrounds and secondary surfaces follow system appearance. Cards respect Reduce
Transparency. Press feedback changes opacity without displacement under Reduce Motion.
Large accessibility text uses one column for Today cards, with no summary line cap. Tools
removes decorative icons at accessibility sizes to leave full width for text. Navigation titles
resolve the current locale bundle explicitly, without resetting draft text or navigation paths.

Empty Trip and unavailable capabilities are explicit. The composer cannot send; typed text
remains in memory. Tab destinations are not inferred from model text. Navigation does not
confirm, save or manufacture a Trip. Future integration must keep Proposal → visible diff →
explicit confirmation → atomic Patch, with server receipts as the only success authority.

For the future contextual Ask sheet, use native dismissal and a visible close control; dismissing
must not confirm a proposal or discard confirmed Trip state. No custom sheet gesture is introduced
by this foundation. Actual sheet and selected-object behavior remain future VPJ-01/10 evidence.

## Verification and rollback

[Evidence](../../artifacts/VPJ-01/verification.md) separates native build/test, simulator observations
and unrun device/Store acceptance. Revert the isolated PR to remove the new native foundation;
the original user source is untouched and no database/local user data rollback is required.
