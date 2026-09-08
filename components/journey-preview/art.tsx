/**
 * Hand-drawn line art for the product demo. Same convention as the hero map
 * landmarks: stroke-only paths, currentColor, no bitmaps and no licensing.
 * Glyphs use a 32x32 grid; scenes use a 64x32 grid so they sit in a card header.
 */

const GLYPHS: Record<string, string[]> = {
  translate: [
    "M4 7 H15 M9.5 7 V5 M6 11 Q9.5 18 13.5 20 M13 11 Q9.5 18 5.5 20",
    "M17 27 L22.5 13 L28 27 M19 22 H26",
    "M4 24 H12 M9 21 L12 24 L9 27",
  ],
  ride: [
    "M5 21 L7.5 14 H24.5 L27 21",
    "M4 21 H28 V25 H4 Z",
    "M7.5 25 V27.5 H10.5 V25 M21.5 25 V27.5 H24.5 V25",
    "M8 18 H24",
    "M16 11 a3 3 0 1 0 0.01 0 M16 4 a5 5 0 0 1 5 5 c0 3.5 -5 7 -5 7 s-5 -3.5 -5 -7 a5 5 0 0 1 5 -5",
  ],
  visa: [
    "M7 4 H23 a2 2 0 0 1 2 2 V26 a2 2 0 0 1 -2 2 H7 Z",
    "M11 4 V28",
    "M15 10 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0 M15 10 H22 M18.5 6.5 Q20.5 10 18.5 13.5 Q16.5 10 18.5 6.5",
    "M15 19 H23 M15 23 H21",
  ],
  network: [
    "M8 12 H20 a2 2 0 0 1 2 2 V26 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V14 Z",
    "M11 17 H17 V22 H11 Z M11 19.5 H17",
    "M22 9 Q26 9 26 5 M22 5 Q29 5 29 -1",
    "M6 12 V6 a2 2 0 0 1 2 -2 H14",
  ],
  human: [
    "M16 12 a4.5 4.5 0 1 0 0.01 0",
    "M7 27 a9 9 0 0 1 18 0",
    "M6 12 a10 10 0 0 1 20 0",
    "M4 12 H7 V18 H4 Z M25 12 H28 V18 H25 Z",
    "M25 18 v2 a3 3 0 0 1 -3 3 H19",
  ],
  clock: ["M16 16 a11 11 0 1 0 0.01 0", "M16 9 V16 L21 19"],
  diff: [
    "M5 5 H15 V27 H5 Z M17 5 H27 V27 H17 Z",
    "M7.5 10 H12.5 M7.5 14 H12.5 M7.5 18 H11",
    "M19.5 10 H24.5 M19.5 14 H24.5 M19.5 18 H24.5 M19.5 22 H23",
    "M13 24.5 H19",
  ],
  expand: ["M5 12 V5 H12 M20 5 H27 V12 M27 20 V27 H20 M12 27 H5 V20", "M12 12 H20 V20 H12 Z"],
  collapse: ["M12 5 V12 H5 M27 12 H20 V5 M20 27 V20 H27 M5 20 H12 V27"],
  lock: ["M9 14 V10 a7 7 0 0 1 14 0 V14", "M7 14 H25 V28 H7 Z", "M16 19 V23"],
  alert: ["M16 4 L29 27 H3 Z", "M16 12 V19 M16 22.5 V23.5"],
};

const SCENES: Record<string, string[]> = {
  bund: [
    "M2 30 H62",
    "M4 30 V17 H10 V30 M12 30 V13 H18 V30 M20 30 V19 H25 V30",
    "M27 30 V11 H31 V30 M29 11 V8",
    "M40 30 V9 M36.5 20 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0 M37.5 13 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0",
    "M47 30 V15 H52 V30 M54 30 V20 H59 V30",
    "M2 26 q5 -1.5 10 0 t10 0",
  ],
  yuyuan: [
    "M2 30 H62",
    "M16 30 V19 M34 30 V19 M20 30 V23 H30 V30",
    "M13 19 H37 M11 19 Q25 10 39 19 M25 10 V7",
    "M44 30 Q46 20 50 18 Q54 20 56 30",
    "M47 25 H53",
    "M2 28 q6 -2 12 0 t12 0",
  ],
  "shanghai-museum": [
    "M2 30 H62",
    "M10 30 V12 H44 V30",
    "M10 12 L27 5 L44 12",
    "M16 30 V20 H22 V30 M32 30 V20 H38 V30",
    "M48 30 V14 H58 V30 M50 18 H56 M50 22 H56 M50 26 H56",
    "M27 5 V2",
  ],
  nanxiang: [
    "M2 30 H62",
    "M14 30 a14 8 0 0 1 28 0 Z",
    "M12 22 H44",
    "M18 18 a4 4 0 1 1 8 0 M30 18 a4 4 0 1 1 8 0",
    "M22 12 Q24 8 22 4 M34 12 Q36 8 34 4 M28 10 Q30 6 28 2",
    "M48 30 V20 H56 V30",
  ],
  laozhengxing: [
    "M2 30 H62",
    "M8 24 H56 M12 24 V30 M52 24 V30",
    "M18 24 a6 4 0 0 1 12 0 M34 24 a6 4 0 0 1 12 0",
    "M24 16 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M28 12 V8",
    "M10 12 V4 H16 V12 Z M13 12 V16",
  ],
  fu1088: [
    "M2 30 H62",
    "M14 30 V12 H42 V30",
    "M14 12 L28 4 L42 12",
    "M20 30 V22 H26 V30 M32 30 V22 H36 V30",
    "M20 17 H24 M32 17 H36",
    "M50 30 V20 Q46 16 50 12 Q54 16 50 20",
    "M8 30 V24 M6 24 H10",
  ],
  "peace-hotel": [
    "M2 30 H62",
    "M20 30 V10 H36 V30",
    "M20 10 L28 2 L36 10",
    "M24 30 V22 H32 V30",
    "M23 17 H26 M30 17 H33",
    "M8 30 V18 H16 V30 M42 30 V16 H52 V30",
    "M28 2 V0",
  ],
  edition: [
    "M2 30 H62",
    "M22 30 V6 H38 V30",
    "M25 11 H35 M25 16 H35 M25 21 H35 M25 26 H35",
    "M30 6 V2",
    "M8 30 V20 H16 V30 M44 30 V22 H54 V30",
    "M44 17 H54 M46 14 H52",
  ],
  capella: [
    "M2 30 H62",
    "M6 30 V16 H18 V30 M18 30 V16 H30 V30 M30 30 V16 H42 V30",
    "M4 16 L12 10 L20 16 M16 16 L24 10 L32 16 M28 16 L36 10 L44 16",
    "M10 30 V24 H14 V30 M22 30 V24 H26 V30 M34 30 V24 H38 V30",
    "M52 30 Q50 22 54 18 Q58 22 56 30 M54 30 V18",
  ],
  "braised-pork": [
    "M10 16 h28 a14 12 0 0 1 -28 0 Z",
    "M8 16 H40",
    "M17 11 h6 v5 h-6 Z M25 9 h6 v7 h-6 Z",
    "M44 6 L52 22 M48 5 L56 21",
    "M14 28 H34",
  ],
  "scallion-noodles": [
    "M10 16 h28 a14 12 0 0 1 -28 0 Z",
    "M8 16 H40",
    "M14 16 q3 -6 6 0 t6 0 t6 0",
    "M20 10 L26 6 M24 11 L30 7",
    "M44 6 L52 22 M48 5 L56 21",
  ],
  "dish-generic": [
    "M10 16 h28 a14 12 0 0 1 -28 0 Z",
    "M8 16 H40",
    "M18 12 a4 3 0 1 0 8 0",
    "M44 6 L52 22 M48 5 L56 21",
  ],
};

export function ToolGlyph({ name, className = "" }: { name: string; className?: string }) {
  const paths = GLYPHS[name] ?? GLYPHS.clock;
  return (
    <svg className={`vp-glyph ${className}`.trim()} viewBox="0 0 32 32" aria-hidden="true">
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}

export function SceneArt({ name, className = "" }: { name: string; className?: string }) {
  const paths = SCENES[name] ?? SCENES["dish-generic"];
  return (
    <svg className={`vp-scene ${className}`.trim()} viewBox="0 0 64 32" aria-hidden="true">
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}
