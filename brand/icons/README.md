# VisePanda Icon Assets

All utility symbols are 24 × 24, use a 2 px rounded `currentColor` stroke, and are designed for product controls. Render a symbol with `<svg aria-hidden="true"><use href="visepanda-utilities.svg#map" /></svg>`; give the adjacent control an accessible text label.

| Sprite | Symbol ID | Use |
| --- | --- | --- |
| Utilities | `itinerary` | Plans and day-by-day trips |
| Utilities | `map` | Maps and destination geography |
| Utilities | `save` | Saved places and wish lists |
| Utilities | `transport` | Train, metro and local transport guidance |
| Utilities | `translation` | Phrase and translation tools |
| Utilities | `food` | Food recommendations |
| Utilities | `stay` | Accommodation guidance |
| Utilities | `currency` | Currency and payment guidance |
| Utilities | `weather` | Weather context |
| Utilities | `safety` | Practical travel-safety information; never emergency authority |
| Utilities | `chat` | AI travel-guide conversation |
| Utilities | `share` | Sharing an itinerary or place |
| Map pins | `pin-active` | Current route stop; round form plus mark |
| Map pins | `pin-saved` | Saved place; round form with a bookmark mark |
| Map pins | `pin-utility` | Completed/utility location; diamond form with a check mark |

`visepanda-pattern.svg` exposes `#visepanda-travel-pattern`. Use it only as a quiet decorative field; its internal marks are intentionally limited to 5–12% opacity and must not sit behind essential copy.

Do not use colour as the only state signal. Active, saved, and utility pins have distinct internal marks and the utility pin has a distinct diamond silhouette.
