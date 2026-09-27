import type { Base, Region, Vector2 } from "@frontline/shared";

// The tuned gameplay (base positions, recon ranges, convoy timing) all lives
// in this small action area — that math is server-authoritative and stays
// exactly where it is. The visual WORLD is much larger and just wraps around
// it, so the map feels vast and pannable without touching game balance.
export const ACTION_W = 1000;
export const ACTION_H = 600;
export const ACTION_CENTER: Vector2 = { x: ACTION_W / 2, y: ACTION_H / 2 };

export const WORLD_MIN: Vector2 = { x: ACTION_CENTER.x - 2400, y: ACTION_CENTER.y - 1500 };
export const WORLD_MAX: Vector2 = { x: ACTION_CENTER.x + 2400, y: ACTION_CENTER.y + 1500 };
export const WORLD_W = WORLD_MAX.x - WORLD_MIN.x;
export const WORLD_H = WORLD_MAX.y - WORLD_MIN.y;

// x-position of the Karsan Valley / Sarrow Ridge boundary within the action
// area (matches the region polygons defined in the server scenario).
const FRONT_X = 620;

// Deterministic PRNG so the terrain texture never "shimmers" on regeneration.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clipRegion(ctx: CanvasRenderingContext2D, region: Region) {
  ctx.beginPath();
  region.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
}

/** Arid ground base: tan/khaki gradient, no faction color wash. */
function paintGround(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  const grad = ctx.createLinearGradient(x0, y0, x0, y0 + h);
  grad.addColorStop(0, "#4a4030");
  grad.addColorStop(0.5, "#3c3527");
  grad.addColorStop(1, "#2e281d");
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, w, h);
}

/** Large, clearly-visible biome patches — rock, dry grass, packed dirt, scree — so the
 * ground reads as varied terrain even before zooming in, not a flat wash. */
function paintBiomePatches(ctx: CanvasRenderingContext2D, rng: () => number, x0: number, y0: number, w: number, h: number) {
  const area = w * h;
  const count = Math.max(40, Math.floor(area / 26000));
  const palette = [
    "rgba(108,96,72,0.4)", // packed dirt
    "rgba(76,84,58,0.32)", // dry scrub
    "rgba(130,118,96,0.3)", // rock/scree
    "rgba(58,50,38,0.4)", // shadowed low ground
    "rgba(150,132,96,0.22)", // sun-bleached ground
  ];
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * w;
    const y = y0 + rng() * h;
    const r = 60 + rng() * 160;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const color = palette[Math.floor(rng() * palette.length)];
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + rng() * 0.35), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

/** Fine detail texture (pebbles/cracked ground) visible once zoomed in. */
function scatterFineTexture(ctx: CanvasRenderingContext2D, rng: () => number, x0: number, y0: number, w: number, h: number) {
  const area = w * h;
  const count = Math.floor(area / 1100);
  const palette = ["rgba(90,78,58,0.16)", "rgba(60,52,38,0.18)", "rgba(120,106,80,0.1)", "rgba(70,90,60,0.08)"];
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * w;
    const y = y0 + rng() * h;
    const r = 6 + rng() * 16;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
    ctx.fill();
  }
}

/** A smooth mountain ridge silhouette (quadratic curves, not a jagged zigzag),
 * with directional shading, a cast ground shadow, and scree/snow caps. */
function drawMountainRange(ctx: CanvasRenderingContext2D, rng: () => number, x0: number, yBase: number, length: number, peakHeight: number, hostile: boolean) {
  const segments = Math.max(6, Math.floor(length / 60));
  const step = length / segments;
  const points: Vector2[] = [{ x: x0, y: yBase }];
  for (let i = 1; i < segments; i++) {
    const x = x0 + i * step;
    const h = peakHeight * (0.35 + rng() * 0.65) * (0.4 + Math.sin((i / segments) * Math.PI));
    points.push({ x, y: yBase - h });
  }
  points.push({ x: x0 + length, y: yBase });

  function smoothPath() {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // soft ground shadow cast toward the lower-right, as if lit from upper-left
  ctx.save();
  ctx.beginPath();
  smoothPath();
  ctx.lineTo(x0 + length + peakHeight * 0.4, yBase + peakHeight * 0.15);
  ctx.lineTo(x0 + peakHeight * 0.4, yBase + peakHeight * 0.15);
  ctx.closePath();
  ctx.fillStyle = "rgba(10,8,6,0.18)";
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  smoothPath();
  ctx.closePath();
  // shade darker on the right (away from the light) for a sense of volume
  const grad = ctx.createLinearGradient(x0, 0, x0 + length, 0);
  if (hostile) {
    grad.addColorStop(0, "rgba(105,66,54,0.72)");
    grad.addColorStop(1, "rgba(64,36,30,0.72)");
  } else {
    grad.addColorStop(0, "rgba(96,84,62,0.68)");
    grad.addColorStop(1, "rgba(52,44,32,0.68)");
  }
  ctx.fillStyle = grad;
  ctx.fill();
  const vgrad = ctx.createLinearGradient(0, yBase - peakHeight, 0, yBase);
  vgrad.addColorStop(0, "rgba(0,0,0,0)");
  vgrad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = vgrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(15,12,9,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  smoothPath();
  ctx.stroke();

  // snow/scree caps on the taller peaks
  ctx.fillStyle = "rgba(215,210,200,0.28)";
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (yBase - p.y > peakHeight * 0.65) {
      ctx.beginPath();
      ctx.moveTo(p.x - 9, p.y + 12);
      ctx.quadraticCurveTo(p.x, p.y - 4, p.x + 9, p.y + 12);
      ctx.quadraticCurveTo(p.x, p.y + 4, p.x - 9, p.y + 12);
      ctx.fill();
    }
  }
}

/** Small decorative rural compound (non-interactive terrain dressing). Optionally ruined. */
function drawDecorativeCompound(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number, ruined = false) {
  const size = 14 + rng() * 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rng() - 0.5) * 0.6);
  ctx.strokeStyle = ruined ? "rgba(120,90,80,0.4)" : "rgba(150,135,105,0.35)";
  ctx.fillStyle = ruined ? "rgba(50,40,34,0.5)" : "rgba(70,62,46,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  const buildings = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < buildings; i++) {
    const bx = (rng() - 0.5) * size;
    const by = (rng() - 0.5) * size;
    const bw = 5 + rng() * 6;
    const bh = 5 + rng() * 6;
    ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    if (ruined) {
      ctx.strokeStyle = "rgba(200,80,60,0.5)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2, by - bh / 2);
      ctx.lineTo(bx + bw / 2, by + bh / 2);
      ctx.moveTo(bx + bw / 2, by - bh / 2);
      ctx.lineTo(bx - bw / 2, by + bh / 2);
      ctx.stroke();
      ctx.strokeStyle = ruined ? "rgba(120,90,80,0.4)" : "rgba(150,135,105,0.35)";
    }
  }
  ctx.restore();
}

/** Scorched bomb crater with a raised rim. */
function drawCrater(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  const r = 6 + rng() * 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15,12,10,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90,78,60,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Burnt-out vehicle wreck: a dark cross-hatched hulk. */
function drawWreck(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rng() * Math.PI * 2);
  ctx.fillStyle = "rgba(25,22,20,0.75)";
  ctx.strokeStyle = "rgba(70,40,30,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-7, -4, 14, 8, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,60,40,0.4)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.lineTo(6, 3);
  ctx.moveTo(6, -3);
  ctx.lineTo(-6, 3);
  ctx.stroke();
  ctx.restore();
}

/** Sandbagged bunker position: a small cluster of stacked-sandbag ellipses. */
function drawBunker(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  const angle = rng() * Math.PI * 2;
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(150,132,96,0.5)";
  ctx.strokeStyle = "rgba(90,78,58,0.5)";
  ctx.lineWidth = 0.8;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * 4, 0, 3, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Zigzag barbed-wire line. */
function drawWireLine(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number) {
  ctx.beginPath();
  const step = 6;
  let y = y0;
  let toggle = 1;
  ctx.moveTo(x, y);
  while (y < y1) {
    y += step;
    ctx.lineTo(x + toggle * 3, y);
    toggle *= -1;
  }
  ctx.strokeStyle = "rgba(180,170,150,0.35)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** The contested boundary between the two regions: trench line, wire, craters,
 * wrecks and dug-in positions — this is what should make the map read as an
 * active front rather than two dots sitting in empty ground. Wreck positions
 * are collected into `smokeSources` so the live render loop can drift smoke
 * off them. */
function drawFrontLine(ctx: CanvasRenderingContext2D, rng: () => number, smokeSources: Vector2[]) {
  const yTop = 30;
  const yBottom = ACTION_H - 20;

  // trench line (double-stroke for a dug earthworks look)
  ctx.beginPath();
  ctx.moveTo(FRONT_X, yTop);
  ctx.lineTo(FRONT_X - 10, ACTION_H * 0.4);
  ctx.lineTo(FRONT_X + 8, ACTION_H * 0.62);
  ctx.lineTo(FRONT_X - 4, yBottom);
  ctx.strokeStyle = "rgba(30,24,18,0.6)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(90,78,58,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // barbed wire lines on both sides of the trench
  drawWireLine(ctx, FRONT_X - 22, yTop, yBottom);
  drawWireLine(ctx, FRONT_X + 20, yTop, yBottom);

  for (let i = 0; i < 14; i++) {
    const t = rng();
    const y = yTop + t * (yBottom - yTop);
    const x = FRONT_X + (rng() - 0.5) * 60;
    const roll = rng();
    if (roll < 0.4) drawCrater(ctx, rng, x, y);
    else if (roll < 0.65) drawBunker(ctx, rng, x, y);
    else if (roll < 0.85) {
      drawWreck(ctx, rng, x, y);
      smokeSources.push({ x, y });
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  ctx.strokeStyle = "rgba(180,190,170,0.045)";
  ctx.lineWidth = 1;
  const step = 100;
  const startX = Math.floor(x0 / step) * step;
  const startY = Math.floor(y0 / step) * step;
  for (let x = startX; x <= x0 + w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + h);
    ctx.stroke();
  }
  for (let y = startY; y <= y0 + h; y += step) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
  }
}

function drawRiver(ctx: CanvasRenderingContext2D) {
  const points: Vector2[] = [
    { x: ACTION_CENTER.x - 1600, y: ACTION_H + 220 },
    { x: 40, y: 480 },
    { x: 180, y: 430 },
    { x: 260, y: 460 },
    { x: 340, y: 400 },
    { x: 420, y: 380 },
    { x: 500, y: 330 },
    { x: 600, y: 300 },
    { x: ACTION_W + 900, y: 40 },
  ];
  const draw = (width: number, style: string) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  draw(11, "rgba(35,50,55,0.85)");
  draw(7, "rgba(70,100,105,0.55)");
  draw(2.5, "rgba(150,185,180,0.3)");
}

function drawRoad(ctx: CanvasRenderingContext2D, bases: Base[]) {
  if (bases.length < 2) return;
  const [a, b] = bases;
  const extendedFrom = { x: a.position.x - 300, y: a.position.y + 120 };
  const extendedTo = { x: b.position.x + 700, y: b.position.y - 80 };
  for (const [p1, p2] of [
    [extendedFrom, a.position],
    [a.position, b.position],
    [b.position, extendedTo],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = "rgba(190,178,150,0.3)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(235,225,200,0.16)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export interface TerrainLayer {
  canvas: HTMLCanvasElement;
  /** World-space points where the front line placed a burning wreck, so the
   * live render loop can drift animated smoke off them. */
  smokeSources: Vector2[];
}

export function buildTerrainLayer(regions: Region[], bases: Base[]): TerrainLayer {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(-WORLD_MIN.x, -WORLD_MIN.y);
  const rng = mulberry32(0xf20a7e1);
  const smokeSources: Vector2[] = [];

  ctx.fillStyle = "#221d15";
  ctx.fillRect(WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);

  paintGround(ctx, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  paintBiomePatches(ctx, rng, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  scatterFineTexture(ctx, rng, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);

  // mountain ridgelines: a few anchored close around the action area so the
  // default view itself doesn't look flat/empty, plus more scattered across
  // the wider world for when you pan out.
  const closeRanges: [number, number, number, number, boolean][] = [
    [ACTION_CENTER.x - 950, ACTION_H - 60, 550, 130, false],
    [ACTION_CENTER.x + 250, -40, 500, 150, true],
    [ACTION_CENTER.x - 300, -120, 700, 110, false],
    [ACTION_CENTER.x + 500, ACTION_H + 40, 600, 120, true],
  ];
  for (const [x0, yBase, length, peak, hostile] of closeRanges) {
    drawMountainRange(ctx, rng, x0, yBase, length, peak, hostile);
  }
  const rangeCount = 12;
  for (let i = 0; i < rangeCount; i++) {
    const x0 = WORLD_MIN.x + rng() * WORLD_W * 0.9;
    const yBase = WORLD_MIN.y + rng() * WORLD_H;
    const length = 300 + rng() * 700;
    const peak = 60 + rng() * 140;
    drawMountainRange(ctx, rng, x0, yBase, length, peak, rng() > 0.5);
  }

  // scattered decorative compounds — mostly ruined near the front, intact
  // further out — inhabiting both the action area and the wider world
  for (let i = 0; i < 40; i++) {
    const x = WORLD_MIN.x + rng() * WORLD_W;
    const y = WORLD_MIN.y + rng() * WORLD_H;
    const nearBaseA = Math.hypot(x - bases[0]?.position.x, y - bases[0]?.position.y) < 90;
    const nearBaseB = bases[1] && Math.hypot(x - bases[1].position.x, y - bases[1].position.y) < 90;
    if (nearBaseA || nearBaseB) continue; // don't overlap the base icons themselves
    const nearFront = Math.abs(x - FRONT_X) < 200 && y > 0 && y < ACTION_H;
    drawDecorativeCompound(ctx, rng, x, y, nearFront && rng() > 0.3);
  }

  drawGrid(ctx, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  drawRoad(ctx, bases);
  drawRiver(ctx);
  drawFrontLine(ctx, rng, smokeSources);

  // region borders + labels only — no flat color wash over the terrain
  for (const region of regions) {
    ctx.save();
    clipRegion(ctx, region);
    // very subtle texture variance so friendly vs. contested ground reads
    // without a color wash: a faint patrol-track hatching on friendly soil
    if (region.control !== "enemy") {
      ctx.strokeStyle = "rgba(210,200,170,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const x = region.path[0].x + rng() * ACTION_W;
        const y = region.path[0].y + rng() * ACTION_H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y + 3);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.beginPath();
    region.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = region.control === "enemy" ? "rgba(180,70,60,0.5)" : "rgba(120,150,180,0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash(region.control === "enemy" ? [8, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 12px ui-monospace, Consolas, monospace";
    const label = region.name.toUpperCase();
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(5,8,12,0.6)";
    ctx.fillRect(region.path[0].x + 6, region.path[0].y + 8, labelW + 8, 17);
    ctx.fillStyle = region.control === "enemy" ? "rgba(220,160,150,0.9)" : "rgba(170,195,215,0.9)";
    ctx.fillText(label, region.path[0].x + 10, region.path[0].y + 20);
  }

  return { canvas, smokeSources };
}
