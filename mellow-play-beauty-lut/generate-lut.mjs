// Generates a standard 3D .cube LUT — no GUI, no external tool, just this
// script. Plain Node, zero dependencies: `node generate-lut.mjs`.
//
// What a .cube LUT actually is: a fixed table mapping every input RGB colour
// to some output RGB colour. That is ALL it is — a per-pixel colour
// transform. It can make skin look warmer, softer in contrast, less harshly
// lit. It CANNOT smooth skin texture, blur, remove blemishes, slim a face,
// or enlarge eyes — those change WHERE pixels come from (blur, warp,
// AI retouching), and no LUT format, from any program, can express that.
// LumaBooth's own "AI Portraits" feature (left-hand menu, separate from
// Filters) is the actual beauty-retouching feature if that's the goal —
// this LUT is the color-grade half, which a LUT genuinely can do well.
//
// The grade this one applies, in order:
//   1. A gentle shadow lift + highlight rolloff (less harsh blacks, softer
//      highlights on skin) — a standard soft-portrait contrast curve.
//   2. Skin-tone-targeted softening: hues in the orange/skin band lose a
//      little saturation and gain a little brightness — the "glow on skin,
//      everything else stays punchy" move real colourists use for beauty
//      grades. Everything outside that hue band is left alone.
//   3. A small warmth push and vibrance lift on everything that ISN'T skin,
//      so the photo doesn't read as washed out overall once skin is
//      softened.
//
// Written as a formula rather than built in a GUI so it's exactly
// reproducible and easy to tune — change the constants in BEAUTY() below
// and re-run. To design your own look by eye instead: grade a reference
// photo in DaVinci Resolve (free) and use its Colour Page -> right-click a
// clip -> "Generate 3D LUT", which exports a .cube in the same format this
// script writes.

import fs from 'node:fs';

const SIZE = 33; // a standard LUT resolution — 17 is coarser/smaller, 65 is
                  // overkill for a photo-booth filter; 33 is the common
                  // middle ground every LUT-reading app (including
                  // LumaBooth's documented custom-LUT support) expects.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/** The grade. Tune the numbers here, not the plumbing above/below. */
function BEAUTY(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);

  // Skin-tone band: hue ~10deg-50deg, peak effect at 30deg (typical
  // skin-tone hue), tapering to nothing at the band's edges. Computed up
  // front from the UNTOUCHED hue, because step 1 below needs to know
  // whether a pixel is skin before it decides how hard to roll off its
  // highlights.
  const hueDeg = h * 360;
  const skinWeight = hueDeg >= 10 && hueDeg <= 50
    ? 1 - Math.min(1, Math.abs(hueDeg - 30) / 20)
    : 0;

  // 1. Shadow lift (uniform — biggest in the dark end, fades to ~0 by
  //    midtones) and highlight rolloff, which is DELIBERATELY WEAKER on
  //    skin. A typical well-lit face sits at l=0.6-0.75 — right where a
  //    uniform rolloff would fight step 2's skin glow and leave bright
  //    skin tones looking darker than they started, which is the opposite
  //    of what a beauty grade is for. Protecting skin highlights here and
  //    adding the glow in step 2 is also the more correct colourist move:
  //    skin should stay luminous while a blown-out sky or a white dress
  //    still gets the filmic rolloff.
  const lifted = l + 0.05 * (1 - l) * (1 - l);
  const rolloffStrength = 0.08 * (1 - 0.6 * skinWeight);
  let l2 = clamp01(lifted - rolloffStrength * lifted * lifted);

  // 2. Skin glow: a touch more lift, a touch less saturation — the "soft
  //    glow on skin, everything else stays punchy" beauty-grade move.
  l2 = clamp01(l2 + 0.05 * skinWeight);
  let s2 = clamp01(s * (1 - 0.18 * skinWeight));

  // 3. Small warmth + vibrance everywhere that ISN'T skin.
  let h2 = h - (2 / 360) * (1 - skinWeight);
  h2 = ((h2 % 1) + 1) % 1;
  s2 = clamp01(s2 * (1 + 0.06 * (1 - skinWeight)));

  return hslToRgb(h2, s2, l2);
}

const lines = [];
lines.push('TITLE "Mellow Play Soft Beauty"');
lines.push(`LUT_3D_SIZE ${SIZE}`);
lines.push('DOMAIN_MIN 0.0 0.0 0.0');
lines.push('DOMAIN_MAX 1.0 1.0 1.0');

// .cube ordering: red fastest, then green, then blue.
for (let bi = 0; bi < SIZE; bi++) {
  for (let gi = 0; gi < SIZE; gi++) {
    for (let ri = 0; ri < SIZE; ri++) {
      const r = ri / (SIZE - 1), g = gi / (SIZE - 1), b = bi / (SIZE - 1);
      const [or_, og, ob] = BEAUTY(r, g, b);
      lines.push(`${or_.toFixed(6)} ${og.toFixed(6)} ${ob.toFixed(6)}`);
    }
  }
}

const outPath = new URL('./Mellow-Play-Soft-Beauty.cube', import.meta.url);
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${lines.length - 4} grid points to ${outPath.pathname.replace(/^\//, '')}`);
