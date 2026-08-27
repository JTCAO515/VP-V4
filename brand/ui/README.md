# VisePanda UI Reference Kit

`visepanda-ui-kit.svg` is a 1600 × 1100 English visual reference sheet for implementation teams. It documents product appearance, minimum target sizing and accessible state treatments; it is not production UI code.

| Component ID | Intended use | Key requirement | Text alternative |
| --- | --- | --- | --- |
| `primary-cta` | Primary trip-planning action | Gold fill, Ink label, 44 px minimum | “Plan my day” button |
| `secondary-cta` | Optional save or secondary action | Cream fill, Ink outline, 44 px minimum | “Save for later” button |
| `navigation` | App or web primary navigation | Active underline and marker, never colour alone | Current navigation item announced programmatically |
| `destination-card` | Destination discovery and saving | Warm clue, labelled save action | “The Great Wall. Take the quieter morning route…” |
| `ai-chat` | AI travel-guide conversation | Clearly label AI; user and assistant differ by label, shape and colour | Assistant recommendation followed by traveller question |
| `map-pins` | Current, saved and utility locations | Distinct silhouette or mark alongside colour | Active stop, saved place, utility/completed location |
| `loading` | Quiet loading state | Use `brand/ip/rest.png` in production; respect reduced-motion preferences | “Finding a little local magic…” |
| `empty-state` | Empty saved-place list | Pair friendly instruction with a labelled CTA | “Nothing saved yet—let’s find your next stop.” |

Colours are the canonical values in `../tokens/visepanda.tokens.json`: Plum-900 `#732E4B`, Gold-500 `#FFAB48`, Butter-100 `#FFF1B8`, Cream-50 `#FFFDF4`, and Ink-950 `#120807`. Maintain 44 × 44 px targets, visible keyboard focus, and programmatic labels for every interactive icon.
