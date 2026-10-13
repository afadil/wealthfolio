export interface Persona {
  id: string;
  row: number;
  column: number;
  tilt?: number;
  eyes: [number, number, number, number][];
}

export const PERSONA_AVATARS: Persona[] = [
  {
    id: "clay-artist-animated",
    row: 0,
    column: 0,
    tilt: 0,
    eyes: [
      [42.8, 47.3, 11, 14],
      [63.1, 47.3, 11, 14],
    ],
  },
  {
    id: "clay-traveler-animated",
    row: 0,
    column: 1,
    tilt: 0,
    eyes: [
      [40.5, 41, 10, 13],
      [60.1, 41, 10, 13],
    ],
  },
  {
    id: "clay-maker-animated",
    row: 0,
    column: 2,
    tilt: 0,
    eyes: [
      [41.9, 45.7, 10, 13],
      [60, 45.7, 10, 13],
    ],
  },
  {
    id: "clay-sailor-animated",
    row: 0,
    column: 3,
    tilt: -10,
    eyes: [
      [37.2, 46.8, 9, 12],
      [54, 44.5, 9, 12],
    ],
  },
  {
    id: "sketch-storyteller-animated",
    row: 1,
    column: 0,
    tilt: -22,
    eyes: [
      [43.5, 40.9, 10, 8.5],
      [61.6, 32, 9.5, 8.5],
    ],
  },
  {
    id: "sketch-thinker-animated",
    row: 1,
    column: 1,
    tilt: -22,
    eyes: [
      [50.6, 40, 10, 8.5],
      [70, 32.8, 9.5, 8.5],
    ],
  },
  {
    id: "sketch-wanderer-animated",
    row: 1,
    column: 2,
    tilt: -22,
    eyes: [
      [46.8, 40, 10, 8.5],
      [67.9, 32.4, 9.5, 8.5],
    ],
  },
  {
    id: "sketch-producer-animated",
    row: 1,
    column: 3,
    tilt: -22,
    eyes: [
      [48.8, 40.7, 10, 8.5],
      [66.9, 34.1, 9.5, 8.5],
    ],
  },
  {
    id: "pixel-wizard-animated",
    row: 2,
    column: 0,
    eyes: [
      [38, 45.6, 6, 9],
      [60.6, 45.6, 6, 9],
    ],
  },
  {
    id: "pixel-inventor-animated",
    row: 2,
    column: 1,
    eyes: [
      [39.7, 44.3, 6, 9],
      [62.7, 44.3, 6, 9],
    ],
  },
  {
    id: "pixel-courier-animated",
    row: 2,
    column: 2,
    eyes: [
      [38.3, 43.7, 6, 9],
      [61.6, 43.7, 6, 9],
    ],
  },
  {
    id: "pixel-musician-animated",
    row: 2,
    column: 3,
    eyes: [
      [41.9, 42.4, 6, 9],
      [60.8, 41.8, 6, 9],
    ],
  },
  {
    id: "abstract-architect-animated",
    row: 3,
    column: 0,
    eyes: [
      [39.9, 42.3, 10, 13],
      [61.6, 42.3, 10, 13],
    ],
  },
  {
    id: "abstract-dancer-animated",
    row: 3,
    column: 1,
    eyes: [
      [38.8, 39.7, 10, 12],
      [61.1, 39.7, 10, 12],
    ],
  },
  {
    id: "abstract-explorer-animated",
    row: 3,
    column: 2,
    eyes: [
      [38.3, 39.4, 10, 12],
      [60.9, 39.4, 10, 12],
    ],
  },
  {
    id: "abstract-dreamer-animated",
    row: 3,
    column: 3,
    eyes: [
      [47.7, 42.3, 9, 11],
      [65.6, 42.3, 9, 11],
    ],
  },
];

// Coordinates refer to the original 1536 × 1024 atlas, excluding its gutters.
export const LINE_PORTRAITS = [
  {
    id: "line-curls-animated",
    x: 19,
    y: 51,
    eyes: [
      [158, 268],
      [249, 260],
    ],
  },
  {
    id: "line-wave-animated",
    x: 397,
    y: 51,
    eyes: [
      [535, 253],
      [620, 237],
    ],
  },
  {
    id: "line-bob-animated",
    x: 777,
    y: 51,
    eyes: [
      [909, 276],
      [1007, 259],
    ],
  },
  {
    id: "line-silver-animated",
    x: 1157,
    y: 51,
    eyes: [
      [1294, 258],
      [1385, 265],
    ],
  },
  {
    id: "line-bun-animated",
    x: 19,
    y: 516,
    eyes: [
      [158, 757],
      [250, 739],
    ],
  },
  {
    id: "line-beard-animated",
    x: 397,
    y: 516,
    eyes: [
      [533, 706],
      [622, 693],
    ],
  },
  {
    id: "line-wisps-animated",
    x: 777,
    y: 516,
    eyes: [
      [912, 707],
      [1006, 711],
    ],
  },
  {
    id: "line-freckles-animated",
    x: 1157,
    y: 516,
    eyes: [
      [1297, 737],
      [1385, 715],
    ],
  },
];

export const ANIMATED_CLAY: Record<
  string,
  { cell: number; tilt: number; eyes: [number, number, number, number][] }
> = {
  "clay-pebble-animated": {
    cell: 0,
    tilt: -18,
    eyes: [
      [44.7, 46.9, 7.6, 10],
      [70.5, 40.5, 7.6, 10],
    ],
  },
  "clay-fluff-animated": {
    cell: 1,
    tilt: 8,
    eyes: [
      [40.5, 42, 12, 16],
      [65, 43, 12, 16],
    ],
  },
  "clay-bot-animated": {
    cell: 2,
    tilt: 8,
    eyes: [
      [36.7, 40.2, 8.5, 10],
      [58.1, 43.7, 8.5, 10],
    ],
  },
  "clay-sun-animated": {
    cell: 3,
    tilt: -18,
    eyes: [
      [43.5, 47.5, 7.2, 10],
      [66.5, 42.4, 7.2, 10],
    ],
  },
};

export const ANIMATED_PIXEL: Record<
  string,
  { cell: number; color: string; eyes: [number, number][] }
> = {
  "pixel-explorer-animated": {
    cell: 0,
    color: "#BBFFF1",
    eyes: [
      [47.8, 44.3],
      [65.7, 44.3],
    ],
  },
  "pixel-fox-animated": {
    cell: 1,
    color: "#352522",
    eyes: [
      [36.5, 48.2],
      [63.3, 47.8],
    ],
  },
  "pixel-ghost-animated": {
    cell: 2,
    color: "#482578",
    eyes: [
      [42.1, 40.2],
      [60, 38.6],
    ],
  },
  "pixel-sprite-animated": {
    cell: 3,
    color: "#382D25",
    eyes: [
      [40, 46.9],
      [58.9, 47.2],
    ],
  },
};

export const ANIMATED_SKETCH: Record<
  string,
  { cell: number; tilt: number; eyes: [number, number, number, number][] }
> = {
  "sketch-glasses-animated": {
    cell: 0,
    tilt: -20,
    eyes: [
      [44.7, 42.6, 9.2, 6.8],
      [65.4, 35.2, 7.8, 6.8],
    ],
  },
  "sketch-curls-animated": {
    cell: 1,
    tilt: -22,
    eyes: [
      [41.9, 42.6, 10, 7],
      [61.4, 34, 8.6, 6.8],
    ],
  },
  "sketch-beanie-animated": {
    cell: 2,
    tilt: -18,
    eyes: [
      [44.3, 35.6, 9, 5.8],
      [63.8, 30.5, 8.2, 5.6],
    ],
  },
  "sketch-scarf-animated": {
    cell: 3,
    tilt: -20,
    eyes: [
      [47.7, 42.6, 10, 7],
      [65.2, 35.9, 7.8, 6.8],
    ],
  },
};

export const PROFILE_AVATAR_GROUPS = [
  {
    name: "Sketch",
    avatars: [
      ...PERSONA_AVATARS.filter((persona) => persona.row === 1).map((persona) => persona.id),
      ...Object.keys(ANIMATED_SKETCH),
    ],
  },
  {
    name: "Line",
    avatars: LINE_PORTRAITS.map((portrait) => portrait.id),
  },
  {
    name: "Pixel art",
    avatars: [
      ...PERSONA_AVATARS.filter((persona) => persona.row === 2).map((persona) => persona.id),
      ...Object.keys(ANIMATED_PIXEL),
    ],
  },
  {
    name: "3D",
    avatars: [
      ...PERSONA_AVATARS.filter((persona) => persona.row === 0).map((persona) => persona.id),
      ...Object.keys(ANIMATED_CLAY),
    ],
  },
  {
    name: "Abstract",
    avatars: [
      ...PERSONA_AVATARS.filter((persona) => persona.row === 3).map((persona) => persona.id),
      "abstract-lantern",
      "abstract-comet",
      "abstract-duet",
      "abstract-mobile",
    ],
  },
];
export const DEFAULT_PROFILE_AVATAR = "default";
export const PROFILE_AVATARS = [
  DEFAULT_PROFILE_AVATAR,
  ...PROFILE_AVATAR_GROUPS.flatMap((group) => group.avatars),
];

interface Sculpture {
  cell: number;
  color: string;
  patch: string;
  offset: [number, number];
  eyes: [number, number, number, number][];
}
export const ABSTRACT_SCULPTURES: Record<string, Sculpture> = {
  "abstract-lantern": {
    cell: 0,
    offset: [-6, -2.5],
    color: "#F0B5A5",
    patch: "ellipse(13.5% 10% at 63% 39%)",
    eyes: [
      [57.3, 40.8, 8.3, 11.8],
      [68.6, 36.4, 8, 11.8],
    ],
  },
  "abstract-duet": {
    cell: 1,
    offset: [3.3, -2.8],
    color: "#CBB7E4",
    patch: "ellipse(12.7% 8% at 54.5% 51.8%)",
    eyes: [
      [48.5, 53.5, 7.6, 9.8],
      [61.5, 50.3, 7.6, 9.8],
    ],
  },
  "abstract-comet": {
    cell: 2,
    offset: [-6.7, 4.5],
    color: "#AFCBE4",
    patch: "ellipse(10.5% 8.5% at 66.2% 35.6%)",
    eyes: [
      [62.5, 36.8, 6.5, 9],
      [70, 33.7, 6.5, 9],
    ],
  },
  "abstract-mobile": {
    cell: 3,
    offset: [-0.9, 5.1],
    color: "#C3D1A4",
    patch: "ellipse(12.8% 9.5% at 50.7% 27.6%)",
    eyes: [
      [45.5, 29.4, 8.3, 11.2],
      [56.6, 25.8, 8.3, 11.2],
    ],
  },
};

export const AVATAR_ATLASES = {
  line: "/avatars/line-portraits-animated.png",
  sketch: "/avatars/sketch-animated-atlas.png",
  pixel: "/avatars/pixel-animated-atlas.png",
  clay: "/avatars/clay-animated-atlas.png",
  abstract: "/avatars/abstract-sculptures.png",
  patches: "/avatars/abstract-sculptures-face-patches.png",
  vintage: "/avatars/creatures-vintage-atlas.png",
  personas: "/avatars/personas-animated-atlas.png",
};
