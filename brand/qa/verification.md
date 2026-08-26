# VisePanda VI Delivery Verification

**Date:** 2026-08-27

## Result

The VisePanda digital-first visual-identity delivery is complete. This record captures the checks performed against the approved design specification and production plan.

## Required inventory

| Area | Expected | Result |
| --- | --- | --- |
| Source integrity | Four owner-supplied assets unchanged | PASS |
| Token system | One parseable JSON file | PASS |
| English handbook | HTML and CSS with all ten required sections | PASS |
| Panda IP | Eight named 1024 × 1024 RGBA PNGs with transparent corners | PASS |
| Icons | Twelve utility symbols, three map pins and one pattern SVG | PASS |
| UI kit | One 1600 × 1100 SVG with eight named reference components | PASS |
| Social exports | Five required PNGs with platform dimensions | PASS |
| Metadata | Parseable manifest with alternate text and format/dimension records | PASS |

## Commands run

```powershell
Get-Content -Raw brand/tokens/visepanda.tokens.json | ConvertFrom-Json | Out-Null
Get-Content -Raw brand/qa/asset-manifest.json | ConvertFrom-Json | Out-Null
Get-ChildItem brand/ip -Filter *.png
Add-Type -AssemblyName System.Drawing
Get-ChildItem brand/ip -Filter *.png | ForEach-Object { ... verify 1024x1024 and all four corner alpha values are 0 ... }
Get-ChildItem brand/social -Filter *.png | ForEach-Object { ... verify output dimensions ... }
rg -n 'id="(purpose|logo|colour|type|ip|illustration|digital|social|accessibility|exports)"' brand/guidelines/visepanda-vi-guide.html
rg -n '<symbol id="(itinerary|map|save|transport|translation|food|stay|currency|weather|safety|chat|share|pin-active|pin-saved|pin-utility)"' brand/icons
git diff --check
```

## Visual review

- Reviewed the square Beijing social export, the transparent Welcome pose and the transparent Rest pose at high detail.
- Confirmed the intended cream sticker edging, plum/gold/cream/ink palette, round panda identity and legible English display copy.
- Confirmed that social title/URL/CTA content falls within the supplied central safe-area guidance.

## Unrun checks

- Live Instagram, TikTok, browser and device rendering were not tested in an external platform.
- Commercial font licensing is not included; the handbook declares font fallbacks.
- The handbook is delivered as responsive HTML/CSS. No print/PDF proof was produced because the accepted scope is digital-first.

## Residual risks

- Platforms may apply additional compression or crop overlays; upload the supplied native PNG dimensions and review each platform preview before publication.
- Travel facts, local recommendations and Chinese-language content must be separately fact-checked for each campaign.

## Rollback

Remove the `brand/` directory only. The owner-supplied `assets/brand/vise-panda/` directory is untouched.

## Mandatory reading order

1. `brand/guidelines/visepanda-vi-guide.html`
2. `brand/README.md`
3. `brand/qa/asset-manifest.json`

## Next action

Owner approves final asset selection for external publication.
