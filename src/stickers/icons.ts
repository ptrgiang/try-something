// The site's animated stickers: our own drawings plus the kit's worked icons, all painted in the brand palette.
import { VIEWS, ellipse, line, pill, poly, rect, spark } from "./fun";
import { bell, chat, gift, heart, padlock, pen, plane, search, trophy } from "./kit-icons";
import { EASY, IN, SOFT, clasp, hop, shackle, springTurn, sway, toss, tossLag, tossLag2, twinkle, sparkle, wiggle } from "./motions";
import type { Icon, Layer, Motion, Palette, Vec } from "./fun";

export const BRAND: Partial<Palette> = {
  main: "#7a5cff",
  gold: "#ffd84a",
  tint: "#efeaff",
  ok: "#2ec4b6",
  hot: "#ff6a45",
  deep: "#3b2a99",
  ink: "#17141f",
};

const LINE = 5;
const { tilt: FACE, extrude: EXT } = VIEWS.right;

const glow = (parent: string, p: Vec, r: number, m: Motion | ReadonlyArray<Motion>, extra: { ip?: number; op?: number } = {}): Layer => ({
  parent,
  a: p,
  p,
  m,
  ...extra,
  shapes: [{ d: spark(p[0], p[1], r), fill: "white" }],
});

// The needle spins out and springs to a new heading, then swings home on the second beat.
export const compass: Icon = {
  name: "compass",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "dial", p: [250, 262], m: { ...hop, k: 0.6 }, shapes: [] },
    {
      id: "face",
      parent: "dial",
      tilt: FACE,
      shapes: [
        { d: ellipse(0, 0, 138), fill: "gold", depth: 1 },
        { d: ellipse(0, 0, 104), fill: "white", depth: 0.25 },
        ...[0, 90, 180, 270].map((deg) => {
          const [s, c] = [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
          return { d: line([s * 84, -c * 84], [s * 98, -c * 98]) };
        }),
      ],
    },
    {
      parent: "face",
      m: [{ r: springTurn(135, 4) }, { r: springTurn(-135, 88) }],
      shapes: [
        { d: poly([[0, -86], [22, 0], [-22, 0]], 4), fill: "hot", depth: 0.4 },
        { d: poly([[22, 0], [0, 86], [-22, 0]], 4), fill: "deep", depth: 0.4 },
        { d: ellipse(0, 0, 13), fill: "white", depth: 0.5 },
      ],
    },
    glow("dial", [150, -138], 28, [twinkle(30), twinkle(120, true)]),
    glow("dial", [-160, -40], 16, sparkle(40)),
  ],
};

const PIP = (x: number, y: number) => ({ d: ellipse(x, y, 15), fill: "ink" as const });

// A die for "anything": it hops and lands on its five.
export const dice: Icon = {
  name: "dice",
  frames: 123,
  line: LINE,
  extrude: [-6, 30],
  layers: [
    { id: "die", a: [0, 110], p: [250, 350], m: hop, shapes: [] },
    {
      parent: "die",
      tilt: FACE,
      shapes: [
        { d: rect(-110, -110, 220, 220, 34), fill: "hot", depth: 1 },
        PIP(-54, -54),
        PIP(54, -54),
        PIP(0, 0),
        PIP(-54, 54),
        PIP(54, 54),
      ],
    },
    glow("die", [138, -150], 26, [twinkle(36), twinkle(96, true)]),
  ],
};

const RIBBON = "M-74 -118L74 -118L74 124L0 74L-74 124Z";

// Saved: a bookmark hops with a sparkle on the landing.
export const bookmark: Icon = {
  name: "bookmark",
  frames: 123,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "mark", a: [0, 124], p: [250, 370], m: hop, shapes: [] },
    {
      parent: "mark",
      tilt: FACE,
      shapes: [
        { d: RIBBON, fill: "main", depth: 1, edges: [[0, 74]] },
        { d: line([-40, -78], [40, -78]) },
      ],
    },
    glow("mark", [130, -150], 30, [twinkle(54), twinkle(104, true)]),
    glow("mark", [-140, -40], 18, [twinkle(58), twinkle(108, true)]),
  ],
};

// An empty Saved list: the same bookmark with a face, swaying while it waits.
export const bookmarkFace: Icon = {
  name: "bookmark-face",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "mark", a: [0, 124], p: [250, 370], m: sway, shapes: [] },
    {
      parent: "mark",
      tilt: FACE,
      shapes: [
        { d: RIBBON, fill: "gold", depth: 1, edges: [[0, 74]] },
        { d: ellipse(-28, -40, 11), fill: "ink" },
        { d: ellipse(28, -40, 11), fill: "ink" },
        { d: "M-26 -2Q0 22 26 -2", round: true },
      ],
    },
  ],
};

// Nothing left for this mood: an open box tosses, its flaps swinging after it.
export const box: Icon = {
  name: "box",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    {
      parent: "crate",
      a: [-120, -60],
      p: [-120, -60],
      m: tossLag2,
      shapes: [{ d: poly([[-120, -60], [-150, -132], [-10, -132], [10, -60]], 6), fill: "tint", depth: 0.4 }],
    },
    {
      parent: "crate",
      a: [120, -60],
      p: [120, -60],
      m: tossLag,
      shapes: [{ d: poly([[120, -60], [150, -132], [20, -132], [0, -60]], 6), fill: "tint", depth: 0.4 }],
    },
    {
      id: "crate",
      a: [-120, 90],
      p: [190, 340],
      tilt: FACE,
      m: toss,
      shapes: [
        { d: rect(-120, -60, 240, 150, 14), fill: "ok", depth: 1 },
        { d: pill(-44, -14, 88, 26), fill: "white", depth: 0.3 },
      ],
    },
    glow("crate", [150, -150], 24, [twinkle(44), twinkle(120, true)]),
  ],
};

// "Play something": a controller rocked like it's mid-game.
export const gamepad: Icon = {
  name: "gamepad",
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "pad", a: [0, 40], p: [250, 290], m: wiggle, shapes: [] },
    {
      parent: "pad",
      tilt: FACE,
      shapes: [
        { d: ellipse(-112, 46, 58, 70), fill: "deep", depth: 1 },
        { d: ellipse(112, 46, 58, 70), fill: "deep", depth: 1 },
        { d: pill(-160, -78, 320, 150), fill: "deep", depth: 1 },
        { d: poly([[-96, -26], [-72, -26], [-72, -50], [-48, -50], [-48, -26], [-24, -26], [-24, -2], [-48, -2], [-48, 22], [-72, 22], [-72, -2], [-96, -2]], 4), fill: "white", depth: 0.3 },
        { d: ellipse(58, -24, 19), fill: "hot", depth: 0.3 },
        { d: ellipse(100, 8, 19), fill: "gold", depth: 0.3 },
      ],
    },
    glow("pad", [150, -130], 26, [twinkle(46), twinkle(126, true)]),
  ],
};

// "Learn something": a book whose pages show on its edge, a ribbon hanging out of it.
export const book: Icon = {
  name: "book",
  frames: 123,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "tome", a: [0, 130], p: [250, 370], m: hop, shapes: [] },
    {
      parent: "tome",
      tilt: FACE,
      shapes: [
        { d: poly([[28, 100], [62, 100], [62, 176], [45, 156], [28, 176]], 3), fill: "hot", depth: 0.2 },
        { d: rect(-104, -136, 208, 252, 18), fill: "ok", side: "paper", depth: 1 },
        { d: rect(-104, -136, 36, 252, 0), fill: "deep", depth: 0 },
        { d: rect(-40, -86, 112, 58, 10), fill: "white", depth: 0.25 },
      ],
    },
    glow("tome", [140, -170], 28, [twinkle(54), twinkle(104, true)]),
  ],
};

// "Get something done": a briefcase picked up by its handle, swinging once.
export const briefcase: Icon = {
  name: "briefcase",
  frames: 123,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: "case", a: [0, 120], p: [250, 360], m: hop, shapes: [] },
    {
      parent: "case",
      tilt: FACE,
      shapes: [
        { d: "M-52 -60L-52 -98A20 20 0 0 1 -32 -118L32 -118A20 20 0 0 1 52 -98L52 -60L30 -60L30 -96L-30 -96L-30 -60Z", fill: "ink", depth: 0.6 },
        { d: rect(-150, -66, 300, 186, 26), fill: "main", depth: 1 },
        { d: line([-150, 6], [150, 6]) },
        { d: rect(-26, -10, 52, 34, 8), fill: "gold", depth: 0.3 },
      ],
    },
    glow("case", [160, -120], 26, [twinkle(54), twinkle(104, true)]),
  ],
};

// Verified: the padlock springs open and a check pops on; played once it rests open. As a loop it shuts again at the end.
const unclasp = { p: [[10, [0, 0], [0.31, 0, 0.12, 1]], [48, [-8, -12], EASY], [84, [0, 0]]] } as const;
const unshackle = {
  p: [[8, [0, 0], SOFT], [38, [-6, -16], 0], [140, [-6, -16], IN], [170, [0, 0]]],
  r: [[8, 0, SOFT], [38, -33, 0], [140, -33, IN], [170, 0]],
} as const;
export const unlock: Icon = {
  ...padlock,
  name: "unlock",
  frames: 180,
  still: 110,
  layers: [
    ...padlock.layers.map((l) => (l.m === clasp ? { ...l, m: unclasp } : l.m === shackle ? { ...l, m: unshackle } : l)),
    {
      parent: "lock",
      a: [104, 70],
      p: [104, 70],
      m: [twinkle(52), twinkle(130, true)],
      shapes: [
        { d: ellipse(104, 70, 46), fill: "gold", depth: 0.4 },
        { d: line([82, 70], [98, 86], [128, 54]), round: true, line: 10 },
      ],
    },
  ],
};

export const STICKERS = {
  compass,
  dice,
  bookmark,
  "bookmark-face": bookmarkFace,
  box,
  heart,
  bell,
  gift,
  plane,
  search,
  chat,
  trophy,
  pen,
  gamepad,
  book,
  briefcase,
  unlock,
} satisfies Record<string, Icon>;
export type StickerName = keyof typeof STICKERS;
