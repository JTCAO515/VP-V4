# VisePanda Delivery Context

## Current task

The owner approved a brand-foundation extension based on the fixed VisePanda logo. The extension is isolated on local branch `codex/visepanda-brand-foundation`; the original delivery remains published separately.

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
- **u:** Added the requested strategic sections to the handbook while retaining the original logo and all production assets.
- **e:** The extension requires owner review before a new remote branch is published.

## Handoff posture

- Deviation class: D1, because the delivery is scoped and reversible; the external push is explicitly owner-authorized.
- Evidence: local release verification passed before the delivery commit; original source assets are unchanged.
- Diversity gap: the delivery used specialized asset agents plus independent deterministic checks and manual visual sampling; it was not verified in a live social platform or browser environment.
- Rollback: use new revert commits for published history; never force-push or alter source artwork.

## Next action

Owner reviews the local `codex/visepanda-brand-foundation` branch and authorizes publication or integration; remote `main` remains protected because it has unrelated history.
