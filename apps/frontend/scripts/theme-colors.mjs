import { lexer, parse } from "css-tree";

const clamp = (value) => Math.max(0, Math.min(1, value));
const linearToSrgb = (value) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

/** Supported absolute sRGB/HSL/OKLCH colors; no runtime-dependent values. */
export function parseColor(value) {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    !lexer.matchType("color", parse(value, { context: "value" })).matched
  ) {
    throw new Error(`Invalid CSS color: ${String(value)}`);
  }
  if (/^#[\da-f]{3,8}$/i.test(value)) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) throw new Error(`Invalid hex color: ${value}`);
    return [0, 2, 4]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  }
  const match = /^(rgba?|hsla?|oklch)\(([^()]+)\)$/i.exec(value);
  if (!match) throw new Error(`Unsupported absolute color: ${value}. Use hex, rgb, hsl or oklch.`);
  const parts = match[2].trim().split(/[\s,/]+/);
  if (
    parts.length < 3 ||
    parts.length > 4 ||
    parts.some((part) => !/^[+-]?(?:\d*\.)?\d+(?:%|deg)?$/.test(part))
  )
    throw new Error(`Unsupported color channels: ${value}`);
  const number = (part, scale = 1) => Number.parseFloat(part) / (part.endsWith("%") ? 100 : scale);
  const alpha = parts[3] === undefined ? 1 : number(parts[3]);
  if (alpha < 0 || alpha > 1) throw new Error(`Alpha outside 0..1: ${value}`);
  let rgb;
  if (match[1].toLowerCase().startsWith("rgb"))
    rgb = parts.slice(0, 3).map((part) => number(part, 255));
  else if (match[1].toLowerCase().startsWith("hsl")) {
    const h = (((number(parts[0]) % 360) + 360) % 360) / 360;
    const sat = number(parts[1]);
    const light = number(parts[2]);
    if (sat < 0 || sat > 1 || light < 0 || light > 1)
      throw new Error(`HSL channels outside supported range: ${value}`);
    const channel = (n) => {
      const k = (n + h * 12) % 12;
      return light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    rgb = [channel(0), channel(8), channel(4)];
  } else {
    const light = number(parts[0]);
    const chroma = number(parts[1]) * (parts[1].endsWith("%") ? 0.4 : 1);
    if (light < 0 || light > 1 || chroma < 0)
      throw new Error(`OKLCH channels outside supported range: ${value}`);
    const hue = (number(parts[2]) * Math.PI) / 180;
    const a = chroma * Math.cos(hue);
    const b = chroma * Math.sin(hue);
    const l = (light + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (light - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (light - 0.0894841775 * a - 1.291485548 * b) ** 3;
    rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(linearToSrgb);
  }
  if (![...rgb, alpha].every(Number.isFinite)) throw new Error(`Nonfinite color: ${value}`);
  return [...rgb.map(clamp), alpha];
}

export function contrast(foreground, background, canvas) {
  let bg = parseColor(background);
  if (canvas !== undefined) {
    const base = parseColor(canvas);
    if (base[3] !== 1) throw new Error("Contrast canvas must be opaque");
    bg = [...bg.slice(0, 3).map((v, i) => v * bg[3] + base[i] * (1 - bg[3])), 1];
  }
  const fg = parseColor(foreground);
  if (bg[3] !== 1) throw new Error("Contrast background must be opaque");
  const luminance = (rgb) =>
    rgb
      .slice(0, 3)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
