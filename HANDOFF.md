# VisePanda Handoff

## Status

**Published for review.** The approved English-first digital visual-identity system is available at [the dedicated GitHub branch](https://github.com/JTCAO515/VP-V4/tree/codex/visepanda-vi-system). Remote `main` has unrelated history and remains unchanged.

## Objective

Publish the VisePanda travel-AI VI system for international visitors travelling in China. The brand positions VisePanda as **“Your warm local friend in China.”**

## Delivered

- English HTML/CSS visual-identity handbook at `brand/guidelines/visepanda-vi-guide.html`.
- Source-sampled design tokens at `brand/tokens/visepanda.tokens.json`.
- Eight transparent 1024 × 1024 VisePanda Guide action poses in `brand/ip/`.
- SVG utility icons, map pins, decorative pattern and UI reference sheet in `brand/icons/` and `brand/ui/`.
- Five ready-to-post social PNGs in `brand/social/`.
- Asset manifest and verification evidence in `brand/qa/`.

## Commits

- `58bdc8d` — VI design specification
- `2f4f91e` — asset-production plan
- `d02eb46` — visual-identity delivery

## Verification actually run

- JSON parsing for tokens and manifest.
- 8 IP images: exact `1024 × 1024`, RGBA format and transparent corner alpha values.
- 5 social images: required platform dimensions.
- SVG XML, 15 SVG symbol IDs and 10 handbook section IDs.
- Source integrity against `5900cd5` and whitespace validation.
- Manual high-detail review of one social export and two transparent panda poses.
- GitHub branch verification: `git ls-remote origin refs/heads/codex/visepanda-vi-system` returned `348291e9c45a46cc326ce6ed0999b836de6469fc`.

The corresponding full record is `brand/qa/verification.md`.

## Unrun checks and residual risk

- Native social-platform upload/cropping and external browser render remain untested.
- Review platform previews before publishing; campaign travel facts and Chinese copy require destination-specific verification.
- GitHub publishing depends on the configured local credential having access to the repository.

## Rollback

Create and publish new revert commits for `d02eb46`, `2f4f91e` and `58bdc8d`; do not rewrite shared history. To remove the asset delivery locally, remove `brand/` only. Never alter `assets/brand/vise-panda/`.

## Reading order

1. `docs/handoff.json`
2. This file
3. `CONTEXT.md`
4. `brand/guidelines/visepanda-vi-guide.html`
5. `brand/qa/verification.md`

## Exactly one next action

Owner reviews the published `codex/visepanda-vi-system` branch before choosing its repository-integration path. Do not overwrite remote `main`.
