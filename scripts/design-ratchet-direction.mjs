// Counts physical left/right Tailwind classes for the design ratchet
// (design-ratchet.mjs); kept apart so its exclusions can be tested.
// Physical left/right classes do not mirror in right-to-left; margins, paddings,
// insets, text alignment, borders and corners have logical forms (ms/me, ps/pe,
// start/end, text-start/end, border-s/e, rounded-s/e). Not counted, because they
// are physical on purpose: classes under an ltr/rtl variant or a physical side
// variant (Base UI's data side or placement set to left or right), and centring at
// half width beside a negative half translate on the same line. Tailwind 4 already
// compiles space-x and divide-x to logical properties.
const spacingValue = String.raw`(?:\d+\/\d+|\d+(?:\.\d+)?|auto|full|px|\[[^\]\s]+\]|\([^)\s]+\))`;
const physicalClass = new RegExp(
  String.raw`(?<![\w-])((?:[^\s"'\x60:\[\]]*(?:\[[^\]\s]*\])?[^\s"'\x60:\[\]]*:)*)!?(-?(?:m[lr]|p[lr]|left|right|inset-[lr]|scroll-[mp][lr])-${spacingValue}|text-(?:left|right)|border-[lr](?:-[\w./[\]%#()-]+)?|rounded-(?:[tb]?[lr])(?:-[\w[\].]+)?|float-(?:left|right)|clear-(?:left|right)|origin-(?:top-|bottom-)?(?:left|right))(?![\w/-])`,
  "g",
);
const physicalSideVariant = /(?:^|:)(?:ltr|rtl):|\[(?:side|placement)=(?:left|right)\]/;
const centringTranslate =
  /(?<![\w-])(?:[^\s"'\x60]*:)?(?:-translate-x-1\/2|translate-x-\[-50%\])(?![\w-])/;

export function physicalDirections(source) {
  let count = 0;
  for (const line of source.split("\n")) {
    const centred = centringTranslate.test(line);
    for (const [, variants, base] of line.matchAll(physicalClass)) {
      if (physicalSideVariant.test(variants)) continue;
      if (centred && /^left-(?:1\/2|\[50%\])$/.test(base)) continue;
      count += 1;
    }
  }
  return count;
}
