import type { Base, Region, Vector2 } from "@frontline/shared";

// The tuned gameplay (base positions, recon ranges, convoy timing) all lives
// in this small action area — that math is server-authoritative and stays
// exactly where it is. The visual WORLD is much larger and just wraps around
// it, so the map feels vast and pannable without touching game balance.
export const ACTION_W = 1000;
export const ACTION_H = 600;
export const ACTION_CENTER: Vector2 = { x: ACTION_W / 2, y: ACTION_H / 2 };

// 8x the explorable area of the previous pass (linear dimensions scaled by
// sqrt(8) to keep the same aspect ratio).
export const WORLD_MIN: Vector2 = { x: ACTION_CENTER.x - 6790, y: ACTION_CENTER.y - 4240 };
export const WORLD_MAX: Vector2 = { x: ACTION_CENTER.x + 6790, y: ACTION_CENTER.y + 4240 };
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

/** Builds a small seamlessly-tileable texture (biome patches + fine pebble
 * detail combined) once, so the whole world can be textured with a single
 * pattern fill instead of scattering draw calls proportional to world area.
 * That distinction is what keeps an 8x-bigger world from taking 8x as long
 * to generate — cost here is now constant, not O(area). */
function buildGroundTexturePattern(rng: () => number): CanvasPattern | null {
  const size = 480;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  function wrapCopies(x: number, y: number, r: number): Vector2[] {
    const copies: Vector2[] = [{ x, y }];
    const left = x - r < 0;
    const right = x + r > size;
    const top = y - r < 0;
    const bottom = y + r > size;
    if (left) copies.push({ x: x + size, y });
    if (right) copies.push({ x: x - size, y });
    if (top) copies.push({ x, y: y + size });
    if (bottom) copies.push({ x, y: y - size });
    if (left && top) copies.push({ x: x + size, y: y + size });
    if (right && top) copies.push({ x: x - size, y: y + size });
    if (left && bottom) copies.push({ x: x + size, y: y - size });
    if (right && bottom) copies.push({ x: x - size, y: y - size });
    return copies;
  }

  const biomePalette = [
    "rgba(108,96,72,0.4)",
    "rgba(76,84,58,0.32)",
    "rgba(130,118,96,0.3)",
    "rgba(58,50,38,0.4)",
    "rgba(150,132,96,0.22)",
  ];
  for (let i = 0; i < 18; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 55 + rng() * 140;
    const ry = r * (0.55 + rng() * 0.35);
    const rot = rng() * Math.PI;
    const color = biomePalette[Math.floor(rng() * biomePalette.length)];
    for (const p of wrapCopies(x, y, r)) {
      const grad = tctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      tctx.beginPath();
      tctx.ellipse(p.x, p.y, r, ry, rot, 0, Math.PI * 2);
      tctx.fillStyle = grad;
      tctx.fill();
    }
  }

  const finePalette = ["rgba(90,78,58,0.16)", "rgba(60,52,38,0.18)", "rgba(120,106,80,0.1)", "rgba(70,90,60,0.08)"];
  for (let i = 0; i < 220; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 6 + rng() * 16;
    const ry = r * (0.5 + rng() * 0.4);
    const rot = rng() * Math.PI;
    const color = finePalette[Math.floor(rng() * finePalette.length)];
    for (const p of wrapCopies(x, y, r)) {
      tctx.beginPath();
      tctx.ellipse(p.x, p.y, r, ry, rot, 0, Math.PI * 2);
      tctx.fillStyle = color;
      tctx.fill();
    }
  }

  return tctx.createPattern(tile, "repeat");
}

/** A smooth mountain ridge silhouette (quadratic curves, not a jagged zigzag),
 * with directional shading, a cast ground shadow, and scree/snow caps.
 * `haze` (0..1) fades and cools the range toward a pale atmospheric blue-grey
 * as if it's further away — the single biggest trick for making the wider
 * world feel huge instead of flat. */
function drawMountainRange(ctx: CanvasRenderingContext2D, rng: () => number, x0: number, yBase: number, length: number, peakHeight: number, haze = 0) {
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
  ctx.fillStyle = `rgba(10,8,6,${0.18 * (1 - haze * 0.8)})`;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  smoothPath();
  ctx.closePath();
  // shade darker on the right (away from the light) for a sense of volume —
  // one neutral rock palette (with mild natural variation) for every range,
  // regardless of which side of the map it's on
  const warm = rng() > 0.5;
  const grad = ctx.createLinearGradient(x0, 0, x0 + length, 0);
  if (warm) {
    grad.addColorStop(0, "rgba(98,72,56,0.7)");
    grad.addColorStop(1, "rgba(58,38,30,0.7)");
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

  // atmospheric haze: fade + cool toward a pale blue-grey the further away
  // this range is meant to read, and soften/lighten the outline to match
  if (haze > 0) {
    ctx.fillStyle = `rgba(150,165,180,${haze * 0.75})`;
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(15,12,9,${0.5 * (1 - haze * 0.85)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  smoothPath();
  ctx.stroke();

  // snow/scree caps on the taller peaks
  ctx.fillStyle = `rgba(215,210,200,${0.28 * (1 - haze * 0.4)})`;
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

/** A shaded rock outcrop cluster — angular boulders with a highlight/shadow
 * pair per rock, reads as real 3-D rock rather than a flat colored blob. */
function drawRockOutcrop(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  const rocks = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < rocks; i++) {
    const x = cx + (rng() - 0.5) * 26;
    const y = cy + (rng() - 0.5) * 18;
    const r = 4 + rng() * 7;
    const sides = 5 + Math.floor(rng() * 3);
    ctx.beginPath();
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rng() * 0.3;
      const rr = r * (0.8 + rng() * 0.3);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.8;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(90,80,68,0.55)";
    ctx.fill();
    ctx.strokeStyle = "rgba(40,34,26,0.5)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // upper-left highlight facet for a sense of volume
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.4, r * 0.25, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(160,148,124,0.3)";
    ctx.fill();
  }
}

/** A dry stream bed: a branching cracked channel cut into the ground. */
function drawWadi(ctx: CanvasRenderingContext2D, rng: () => number, startX: number, startY: number, dirX: number, dirY: number, length: number) {
  let x = startX;
  let y = startY;
  let dx = dirX;
  let dy = dirY;
  ctx.strokeStyle = "rgba(20,16,12,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    dx += (rng() - 0.5) * 0.6;
    dy += (rng() - 0.5) * 0.6;
    const norm = Math.hypot(dx, dy) || 1;
    dx /= norm;
    dy /= norm;
    x += dx * (length / steps);
    y += dy * (length / steps);
    ctx.lineTo(x, y);
    if (i === Math.floor(steps / 2) && rng() > 0.4) {
      // a small branch
      ctx.moveTo(x, y);
      const bx = x + dy * (length * 0.25) * (rng() > 0.5 ? 1 : -1);
      const by = y - dx * (length * 0.25) * (rng() > 0.5 ? 1 : -1);
      ctx.lineTo(bx, by);
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(110,96,72,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A dry, cracked lakebed patch — a very recognizable arid-terrain signature. */
function drawCrackedEarthPatch(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.65, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgba(150,132,100,0.22)";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // a rough polygon "cell" network of crack lines
  const cells = 10 + Math.floor(rng() * 6);
  const centers: Vector2[] = [];
  for (let i = 0; i < cells; i++) {
    centers.push({ x: cx + (rng() - 0.5) * radius * 1.8, y: cy + (rng() - 0.5) * radius * 1.2 });
  }
  ctx.strokeStyle = "rgba(30,24,18,0.4)";
  ctx.lineWidth = 0.8;
  for (const p of centers) {
    // connect each center to its two nearest neighbors for a crackle look
    const others = centers
      .filter((q) => q !== p)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, 2);
    for (const o of others) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }
  }
  ctx.restore();
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

/** Small shrub cluster — used to green up the riverbank against the dry ground. */
function drawShrub(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  const clumps = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < clumps; i++) {
    const x = cx + (rng() - 0.5) * 10;
    const y = cy + (rng() - 0.5) * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rng() * 3, 2 + rng() * 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${70 + rng() * 20 | 0},${95 + rng() * 25 | 0},${55 + rng() * 15 | 0},0.4)`;
    ctx.fill();
  }
}

/** A small roadside utility pole with a crossbar and sagging wire to the next one. */
function drawUtilityPole(ctx: CanvasRenderingContext2D, x: number, y: number, nextX: number, nextY: number) {
  ctx.strokeStyle = "rgba(40,34,26,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 11);
  ctx.moveTo(x - 4, y - 9);
  ctx.lineTo(x + 4, y - 9);
  ctx.stroke();
  const midX = (x + nextX) / 2;
  const midY = (y + nextY) / 2 - 8;
  ctx.strokeStyle = "rgba(60,55,45,0.3)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.quadraticCurveTo(midX, midY - 9, nextX, nextY - 9);
  ctx.stroke();
}

/** A small dug-in border checkpoint post: watchtower silhouette + a short fence run.
 * One neutral color for every post — territory reads through the road/town
 * network and unit presence, not a faction-tinted marker. */
function drawCheckpointPost(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const color = "rgba(170,160,135,0.6)";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(60,52,40,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-16, 3);
  ctx.lineTo(16, 3);
  ctx.stroke();
  ctx.fillStyle = "rgba(20,17,13,0.7)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(-4, -10, 8, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(0, -16);
  ctx.lineTo(6, -10);
  ctx.stroke();
  ctx.restore();
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

/** The river's course through the action area (exported so the live render
 * loop can place animated sparkle glints along the exact same path). */
export const RIVER_POINTS: Vector2[] = [
  { x: 40, y: 480 },
  { x: 180, y: 430 },
  { x: 260, y: 460 },
  { x: 340, y: 400 },
  { x: 420, y: 380 },
  { x: 500, y: 330 },
  { x: 600, y: 300 },
];

function drawRiver(ctx: CanvasRenderingContext2D) {
  const points: Vector2[] = [{ x: ACTION_CENTER.x - 1600, y: ACTION_H + 220 }, ...RIVER_POINTS, { x: ACTION_W + 900, y: 40 }];
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

  // roadside utility poles along the main Alpha-Bravo stretch
  const [pa, pb] = [a.position, b.position];
  const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const poleCount = Math.floor(dist / 55);
  const nx = -(pb.y - pa.y) / dist;
  const ny = (pb.x - pa.x) / dist;
  const points: Vector2[] = [];
  for (let i = 0; i <= poleCount; i++) {
    const t = i / poleCount;
    points.push({ x: pa.x + (pb.x - pa.x) * t + nx * 14, y: pa.y + (pb.y - pa.y) * t + ny * 14 });
  }
  for (let i = 0; i < points.length - 1; i++) {
    drawUtilityPole(ctx, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
  }
}

interface Town {
  name: string;
  pos: Vector2;
}

/** Fictional settlements scattered across Karsia — some close enough to see
 * without panning, others out in the wider country. Positions are relative
 * to ACTION_CENTER so they stay put regardless of where the two bases sit. */
const TOWNS: Town[] = [
  { name: "Kalanshir", pos: { x: ACTION_CENTER.x - 480, y: ACTION_CENTER.y + 260 } },
  { name: "Ferrabad", pos: { x: ACTION_CENTER.x - 60, y: ACTION_CENTER.y - 480 } },
  { name: "Deshkala", pos: { x: ACTION_CENTER.x + 120, y: ACTION_CENTER.y + 560 } },
  { name: "Bashkar", pos: { x: ACTION_CENTER.x - 1400, y: ACTION_CENTER.y + 500 } },
  { name: "Nowdeh", pos: { x: ACTION_CENTER.x + 700, y: ACTION_CENTER.y - 850 } },
  { name: "Old Vantor", pos: { x: ACTION_CENTER.x + 1500, y: ACTION_CENTER.y - 150 } },
  { name: "Rashtavan", pos: { x: ACTION_CENTER.x - 900, y: ACTION_CENTER.y - 700 } },
  { name: "Kelmund", pos: { x: ACTION_CENTER.x + 1000, y: ACTION_CENTER.y + 700 } },
  { name: "Torshan", pos: { x: ACTION_CENTER.x - 3200, y: ACTION_CENTER.y - 1800 } },
  { name: "Velkabad", pos: { x: ACTION_CENTER.x + 3500, y: ACTION_CENTER.y + 1200 } },
  { name: "Onshera", pos: { x: ACTION_CENTER.x - 2200, y: ACTION_CENTER.y + 2600 } },
  { name: "Garakol", pos: { x: ACTION_CENTER.x + 2600, y: ACTION_CENTER.y - 2400 } },
  { name: "Meshtavi", pos: { x: ACTION_CENTER.x - 5000, y: ACTION_CENTER.y - 600 } },
  { name: "Dovrenk", pos: { x: ACTION_CENTER.x + 4800, y: ACTION_CENTER.y + 2700 } },
  { name: "Halveth", pos: { x: ACTION_CENTER.x - 4200, y: ACTION_CENTER.y + 3200 } },
  { name: "Corvane", pos: { x: ACTION_CENTER.x + 5400, y: ACTION_CENTER.y - 1200 } },
];

interface Fob {
  name: string;
  pos: Vector2;
}

/** Decorative forward operating bases — smaller dug-in outposts that aren't
 * part of the tuned gameplay, just visual proof the front is held by more
 * than two compounds. */
const FOBS: Fob[] = [
  { name: "FOB Anvil", pos: { x: ACTION_CENTER.x - 700, y: ACTION_CENTER.y - 200 } },
  { name: "OP Granite", pos: { x: ACTION_CENTER.x + 350, y: ACTION_CENTER.y + 450 } },
  { name: "FOB Cinder", pos: { x: ACTION_CENTER.x - 1600, y: ACTION_CENTER.y - 950 } },
  { name: "OP Falcon", pos: { x: ACTION_CENTER.x + 900, y: ACTION_CENTER.y - 400 } },
  { name: "FOB Driftwood", pos: { x: ACTION_CENTER.x - 2600, y: ACTION_CENTER.y + 1100 } },
  { name: "OP Ironwood", pos: { x: ACTION_CENTER.x + 2000, y: ACTION_CENTER.y + 1800 } },
  { name: "FOB Halyard", pos: { x: ACTION_CENTER.x - 900, y: ACTION_CENTER.y + 1600 } },
  { name: "OP Juniper", pos: { x: ACTION_CENTER.x + 1900, y: ACTION_CENTER.y - 1400 } },
  { name: "FOB Marrow", pos: { x: ACTION_CENTER.x - 3600, y: ACTION_CENTER.y - 300 } },
  { name: "OP Sable", pos: { x: ACTION_CENTER.x + 3100, y: ACTION_CENTER.y + 400 } },
];

/** A smaller, purely visual outpost: perimeter, one watchtower, a couple of
 * tents, a flagpole. Not tied to any gameplay resources. */
function drawFob(ctx: CanvasRenderingContext2D, rng: () => number, fob: Fob) {
  const { x, y } = fob.pos;
  const half = 15;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(70,62,46,0.4)";
  ctx.strokeStyle = "rgba(170,160,135,0.5)";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(-half, -half, half * 2, half * 2);

  ctx.fillStyle = "rgba(8,13,19,0.85)";
  ctx.beginPath();
  ctx.arc(-half, -half, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const tents: [number, number][] = [
    [3, -2],
    [-2, 6],
  ];
  ctx.fillStyle = "rgba(140,124,92,0.55)";
  for (const [tx, ty] of tents) {
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty + 3);
    ctx.lineTo(tx, ty - 3);
    ctx.lineTo(tx + 4, ty + 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(200,195,185,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(half, half);
  ctx.lineTo(half, half - 10);
  ctx.stroke();
  ctx.restore();

  ctx.font = "600 9px ui-monospace, Consolas, monospace";
  const labelW = ctx.measureText(fob.name).width;
  ctx.fillStyle = "rgba(5,8,12,0.55)";
  ctx.fillRect(x - labelW / 2 - 3, y + half + 4, labelW + 6, 12);
  ctx.fillStyle = "rgba(190,182,160,0.8)";
  ctx.textAlign = "center";
  ctx.fillText(fob.name, x, y + half + 13);
  ctx.textAlign = "left";
}

/** A proper settlement — a loose cluster of buildings around a small square,
 * with a name label — bigger and denser than the single-farmstead compound. */
function drawTown(ctx: CanvasRenderingContext2D, rng: () => number, town: Town, ruined = false) {
  const { x, y } = town.pos;
  const buildingCount = 8 + Math.floor(rng() * 6);
  for (let i = 0; i < buildingCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = 14 + rng() * 42;
    const bx = x + Math.cos(a) * r;
    const by = y + Math.sin(a) * r * 0.7;
    const bw = 6 + rng() * 8;
    const bh = 6 + rng() * 8;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((rng() - 0.5) * 0.5);
    ctx.fillStyle = ruined ? "rgba(55,44,36,0.55)" : "rgba(130,114,86,0.55)";
    ctx.strokeStyle = ruined ? "rgba(110,80,70,0.5)" : "rgba(60,52,38,0.55)";
    ctx.lineWidth = 0.8;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }
  // small internal lanes threading between the buildings
  ctx.strokeStyle = "rgba(200,190,165,0.14)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = "600 11px ui-monospace, Consolas, monospace";
  const labelW = ctx.measureText(town.name).width;
  ctx.fillStyle = "rgba(5,8,12,0.55)";
  ctx.fillRect(x - labelW / 2 - 4, y + 56, labelW + 8, 15);
  ctx.fillStyle = "rgba(205,195,170,0.85)";
  ctx.textAlign = "center";
  ctx.fillText(town.name, x, y + 67);
  ctx.textAlign = "left";
}

function drawRoadSegment(ctx: CanvasRenderingContext2D, a: Vector2, b: Vector2, style: "town" | "track") {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  if (style === "town") {
    ctx.strokeStyle = "rgba(180,168,140,0.24)";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(230,220,195,0.12)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = "rgba(170,158,132,0.16)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function posKey(a: Vector2, b: Vector2): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x.toFixed(0)},${p.y.toFixed(0)}|${q.x.toFixed(0)},${q.y.toFixed(0)}`;
}

/** Connects every settlement + base into a real road network: a spanning
 * tree so everything is reachable, plus extra cross-links between nearby
 * towns so it reads as a country criss-crossed by roads rather than one
 * thin spine, plus short spur tracks out to the forward outposts. */
function drawRoadNetwork(ctx: CanvasRenderingContext2D, bases: Base[], towns: Town[], fobs: Fob[]) {
  const connected: Vector2[] = bases.map((b) => b.position);
  const remaining = [...towns];
  const drawnEdges = new Set<string>();

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestTarget = connected[0];
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      for (const c of connected) {
        const d = Math.hypot(remaining[i].pos.x - c.x, remaining[i].pos.y - c.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
          bestTarget = c;
        }
      }
    }
    const town = remaining.splice(bestIdx, 1)[0];
    drawRoadSegment(ctx, bestTarget, town.pos, "town");
    drawnEdges.add(posKey(bestTarget, town.pos));
    connected.push(town.pos);
  }

  // extra cross-links: connect each town to its next-nearest neighbor too,
  // so the network has loops in it instead of being a single branching tree
  const allPoints = [...bases.map((b) => b.position), ...towns.map((t) => t.pos)];
  for (const town of towns) {
    const others = allPoints
      .filter((p) => p !== town.pos)
      .map((p) => ({ p, d: Math.hypot(p.x - town.pos.x, p.y - town.pos.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { p, d } of others) {
      const key = posKey(town.pos, p);
      if (drawnEdges.has(key) || d > 2600) continue;
      drawnEdges.add(key);
      drawRoadSegment(ctx, town.pos, p, "town");
    }
  }

  // spur tracks out to the forward outposts
  for (const fob of fobs) {
    let nearest = allPoints[0];
    let bestDist = Infinity;
    for (const p of allPoints) {
      const d = Math.hypot(p.x - fob.pos.x, p.y - fob.pos.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = p;
      }
    }
    drawRoadSegment(ctx, nearest, fob.pos, "track");
  }
}

function drawRiverVegetation(ctx: CanvasRenderingContext2D, rng: () => number) {
  const points = RIVER_POINTS;
  for (let i = 0; i < points.length - 1; i++) {
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = points[i].x + (points[i + 1].x - points[i].x) * t;
      const y = points[i].y + (points[i + 1].y - points[i].y) * t;
      const side = rng() > 0.5 ? 1 : -1;
      if (rng() > 0.35) drawShrub(ctx, rng, x + side * (10 + rng() * 8), y + side * (4 + rng() * 4));
    }
  }
}

/** Guard posts spaced along the contested region border, matching the
 * spec's "checkpoints" — dug-in on both sides, not just a line on the map. */
function drawBorderCheckpoints(ctx: CanvasRenderingContext2D) {
  const friendlySide = FRONT_X - 40;
  const hostileSide = FRONT_X + 38;
  const positions = [80, 220, 380, 520];
  for (const y of positions) {
    if (y < 0 || y > ACTION_H) continue;
    drawCheckpointPost(ctx, friendlySide, y);
    drawCheckpointPost(ctx, hostileSide, y + 60);
  }
}

export interface TerrainLayer {
  canvas: HTMLCanvasElement;
  /** World-space points where the front line placed a burning wreck, so the
   * live render loop can drift animated smoke off them. */
  smokeSources: Vector2[];
}

// The world is generated in fixed-size chunks rather than one giant canvas.
// A single canvas covering the whole 8x world would need a ~115-million-pixel
// (~460MB) backing store, which measured at ~2.5s just to *allocate* — a
// hard freeze on every campaign join, before a single pixel of content was
// even drawn. Chunking keeps each canvas allocation small (fast) and only
// pays that cost lazily, for chunks the camera actually approaches.
// Determinism: every chunk reseeds the SAME rng from the SAME constant seed
// and replays the identical sequence of draw calls in the identical order —
// so every feature ends up at the same world position with the same shape
// no matter which chunk (or how many times) it gets rendered from.
export const CHUNK_SIZE = 2200;

export function chunkIndexAt(worldX: number, worldY: number): { cx: number; cy: number } {
  return {
    cx: Math.floor((worldX - WORLD_MIN.x) / CHUNK_SIZE),
    cy: Math.floor((worldY - WORLD_MIN.y) / CHUNK_SIZE),
  };
}

export function renderChunk(regions: Region[], bases: Base[], cx: number, cy: number): TerrainLayer {
  const originX = WORLD_MIN.x + cx * CHUNK_SIZE;
  const originY = WORLD_MIN.y + cy * CHUNK_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = CHUNK_SIZE;
  canvas.height = CHUNK_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(-originX, -originY);
  const rng = mulberry32(0xf20a7e1);
  const smokeSources: Vector2[] = [];

  ctx.fillStyle = "#221d15";
  ctx.fillRect(WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);

  paintGround(ctx, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  const groundPattern = buildGroundTexturePattern(rng);
  if (groundPattern) {
    ctx.fillStyle = groundPattern;
    ctx.fillRect(WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  }

  // mountain ridgelines: a few anchored close around the action area so the
  // default view itself doesn't look flat/empty, plus more scattered across
  // the wider world for when you pan out.
  const closeRanges: [number, number, number, number][] = [
    [ACTION_CENTER.x - 950, ACTION_H - 60, 550, 130],
    [ACTION_CENTER.x + 250, -40, 500, 150],
    [ACTION_CENTER.x - 300, -120, 700, 110],
    [ACTION_CENTER.x + 500, ACTION_H + 40, 600, 120],
  ];
  for (const [x0, yBase, length, peak] of closeRanges) {
    drawMountainRange(ctx, rng, x0, yBase, length, peak);
  }
  // scattered further out, with atmospheric haze scaling by distance from
  // the action area — this is what sells "huge landscape" over "flat prop".
  // Counts are scaled up for the larger world so it doesn't get sparser.
  const maxHazeDist = Math.hypot(WORLD_W, WORLD_H) / 2;
  const rangeCount = 46;
  for (let i = 0; i < rangeCount; i++) {
    const x0 = WORLD_MIN.x + rng() * WORLD_W * 0.9;
    const yBase = WORLD_MIN.y + rng() * WORLD_H;
    const length = 300 + rng() * 700;
    const peak = 60 + rng() * 140;
    const dist = Math.hypot(x0 + length / 2 - ACTION_CENTER.x, yBase - ACTION_CENTER.y);
    const haze = Math.min(0.85, (dist / maxHazeDist) * 1.4);
    drawMountainRange(ctx, rng, x0, yBase, length, peak, haze);
  }

  // rock outcrops and dry wadi channels — real ground detail, not just color
  for (let i = 0; i < 90; i++) {
    const x = WORLD_MIN.x + rng() * WORLD_W;
    const y = WORLD_MIN.y + rng() * WORLD_H;
    drawRockOutcrop(ctx, rng, x, y);
  }
  for (let i = 0; i < 22; i++) {
    const x = WORLD_MIN.x + rng() * WORLD_W;
    const y = WORLD_MIN.y + rng() * WORLD_H;
    const angle = rng() * Math.PI * 2;
    drawWadi(ctx, rng, x, y, Math.cos(angle), Math.sin(angle), 140 + rng() * 220);
  }
  drawCrackedEarthPatch(ctx, rng, ACTION_CENTER.x - 1400, ACTION_CENTER.y + 500, 180);
  drawCrackedEarthPatch(ctx, rng, ACTION_CENTER.x + 1700, ACTION_CENTER.y - 700, 220);
  drawCrackedEarthPatch(ctx, rng, ACTION_CENTER.x - 4200, ACTION_CENTER.y + 1900, 260);
  drawCrackedEarthPatch(ctx, rng, ACTION_CENTER.x + 4600, ACTION_CENTER.y - 2200, 300);

  // scattered decorative compounds (farmsteads/hamlets) — mostly ruined near
  // the front, intact further out — filling the space between the towns
  for (let i = 0; i < 110; i++) {
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
  drawRoadNetwork(ctx, bases, TOWNS, FOBS);
  for (const town of TOWNS) drawTown(ctx, rng, town, town.pos.x > FRONT_X);
  for (const fob of FOBS) drawFob(ctx, rng, fob);
  drawRiver(ctx);
  drawRiverVegetation(ctx, rng);
  drawBorderCheckpoints(ctx);
  // Only the chunk(s) actually covering the front line need to compute it —
  // everywhere else it would just be clipped away, but its wreck positions
  // would still get pushed into smokeSources and duplicated on every chunk
  // that ever gets generated, since the array is aggregated across chunks.
  const frontLineOverlaps = originX < FRONT_X + 80 && originX + CHUNK_SIZE > FRONT_X - 80 && originY < ACTION_H + 40 && originY + CHUNK_SIZE > -40;
  if (frontLineOverlaps) drawFrontLine(ctx, rng, smokeSources);

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

    // one neutral boundary style for every region — no red/blue "zone" coding.
    // The border is a thin, unobtrusive administrative line, not a faction wash.
    ctx.beginPath();
    region.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(180,170,145,0.3)";
    ctx.lineWidth = 1.3;
    ctx.setLineDash([9, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 12px ui-monospace, Consolas, monospace";
    const label = region.name.toUpperCase();
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(5,8,12,0.6)";
    ctx.fillRect(region.path[0].x + 6, region.path[0].y + 8, labelW + 8, 17);
    ctx.fillStyle = "rgba(205,195,170,0.85)";
    ctx.fillText(label, region.path[0].x + 10, region.path[0].y + 20);
  }

  return { canvas, smokeSources };
}

/** Lazily generates and caches chunks as the camera needs them. Cheap to
 * query every frame — cache hits are just a Map lookup. Generation itself is
 * budgeted per call to `get`: a fast pan or zoom-out can bring many
 * never-seen chunks into view at once, and generating all of them
 * synchronously in one animation frame would freeze that frame for however
 * many chunks are missing. `beginFrame` resets the per-frame budget; once
 * it's spent, `get` returns undefined for anything not already cached and
 * that chunk is retried on a later frame instead, spreading pop-in over a
 * few frames rather than blocking one. */
export class ChunkCache {
  private cache = new Map<string, TerrainLayer>();
  private regions: Region[];
  private bases: Base[];
  private budgetRemaining = 0;

  constructor(regions: Region[], bases: Base[]) {
    this.regions = regions;
    this.bases = bases;
  }

  beginFrame(maxNewChunks = 2) {
    this.budgetRemaining = maxNewChunks;
  }

  get(cx: number, cy: number): TerrainLayer | undefined {
    const key = `${cx},${cy}`;
    let chunk = this.cache.get(key);
    if (!chunk) {
      if (this.budgetRemaining <= 0) return undefined;
      this.budgetRemaining--;
      chunk = renderChunk(this.regions, this.bases, cx, cy);
      this.cache.set(key, chunk);
    }
    return chunk;
  }

  /** All smoke sources across every chunk generated so far — new chunks add
   * their wrecks to the animation as they're revealed. */
  allSmokeSources(): Vector2[] {
    const all: Vector2[] = [];
    for (const chunk of this.cache.values()) all.push(...chunk.smokeSources);
    return all;
  }
}
