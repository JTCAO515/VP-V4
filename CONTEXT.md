# VisePanda Delivery Context

## Current task

The owner approved and requested publication of the VisePanda digital visual-identity delivery. The immediate state is local `master`, awaiting a first push to the owner-authorized GitHub repository.

## Design baseline

- Audience: English-speaking international visitors to China.
- Brand role: warm local friend, not a cold generic travel tool.
- Visual language: Korean-inspired minimal flat illustration, relaxed hand-drawn cartoon, cream sticker edge, round joyful panda, dark plum and antique-gold palette with butter highlights.
- Non-negotiables: preserve the supplied panda/phone identity; no neon/cyberpunk/glossy 3D/corporate SaaS style; no official-authority implication.

## Repository map

| Path | Purpose |
| --- | --- |
| `assets/brand/vise-panda/` | Immutable owner-supplied source artwork. |
| `brand/` | New delivery; all derived assets live here. |
| `brand/guidelines/` | English visual-identity handbook. |
| `brand/ip/` | Eight transparent Panda Guide poses. |
| `brand/icons/` | SVG utility icons, pins and pattern. |
| `brand/social/` | Platform-sized social exports. |
| `brand/ui/` | UI reference SVG. |
| `brand/qa/` | Manifest and reproducible verification notes. |
| `docs/superpowers/` | Approved VI design specification and production plan. |

## Control loop

- **r:** Owner-approved VI system and request to publish it to the named GitHub repository.
- **y:** `brand/qa/verification.md`, `git status --short`, `git remote -v`, and GitHub’s push response.
- **u:** Published the committed delivery to `origin/codex/visepanda-vi-system`.
- **e:** GitHub `main` has unrelated existing history, so it was deliberately preserved.

## Handoff posture

- Deviation class: D1, because the delivery is scoped and reversible; the external push is explicitly owner-authorized.
- Evidence: local release verification passed before the delivery commit; original source assets are unchanged.
- Diversity gap: the delivery used specialized asset agents plus independent deterministic checks and manual visual sampling; it was not verified in a live social platform or browser environment.
- Rollback: use new revert commits for published history; never force-push or alter source artwork.

## Next action

Owner reviews [the published branch](https://github.com/JTCAO515/VP-V4/tree/codex/visepanda-vi-system) before selecting an integration path that preserves the unrelated remote `main` history.
