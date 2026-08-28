import brandTokens from "@/brand/tokens/visepanda.tokens.json";

type BrandToken = { value: string; role: string };
type TypographyToken = { family: string; weight: number; role: string };

function token(group: Record<string, BrandToken>, name: string) {
  return group[name].value;
}

const colors = brandTokens.color as Record<string, BrandToken>;
const layout = brandTokens.layout as Record<string, BrandToken>;
const material = brandTokens.material as Record<string, BrandToken>;
const typography = brandTokens.typography as Record<string, TypographyToken>;

/**
 * The only runtime translation of the approved VisePanda token manifest.
 * CSS custom properties mirror these values for server-rendered styles.
 */
export const designTokens = Object.freeze({
  colors: Object.freeze({
    plum900: token(colors, "VP-Plum-900"),
    plum700: token(colors, "VP-Plum-700"),
    gold800: token(colors, "VP-Gold-800"),
    gold500: token(colors, "VP-Gold-500"),
    butter100: token(colors, "VP-Butter-100"),
    cream50: token(colors, "VP-Cream-50"),
    ink950: token(colors, "VP-Ink-950"),
  }),
  typography: Object.freeze({
    display: typography.display.family,
    body: typography.body.family,
    multilingual: typography.multilingual.family,
  }),
  layout: Object.freeze({
    space: token(layout, "space-base"),
    radius: token(layout, "radius-standard"),
    featureRadius: token(layout, "radius-feature"),
    touchMinimum: token(layout, "touch-minimum"),
  }),
  material: Object.freeze({
    outline: token(material, "outline"),
    stickerEdge: token(material, "sticker-edge"),
    shadow: token(material, "shadow"),
  }),
});
