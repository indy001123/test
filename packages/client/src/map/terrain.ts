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

function scatterGroundTexture(ctx: CanvasRenderingContext2D, rng: () => number, x0: number, y0: number, w: number, h: number) {
  const area = w * h;
  const count = Math.floor(area / 1600);
  const palette = ["rgba(90,78,58,0.14)", "rgba(60,52,38,0.16)", "rgba(120,106,80,0.08)", "rgba(70,90,60,0.06)"];
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * w;
    const y = y0 + rng() * h;
    const r = 10 + rng() * 30;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
    ctx.fill();
  }
}

/** A jagged mountain ridge silhouette with simple shading, drawn along a baseline. */
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

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, yBase - peakHeight, 0, yBase);
  if (hostile) {
    grad.addColorStop(0, "rgba(72,48,42,0.55)");
    grad.addColorStop(1, "rgba(40,28,24,0.35)");
  } else {
    grad.addColorStop(0, "rgba(68,60,48,0.5)");
    grad.addColorStop(1, "rgba(36,32,24,0.3)");
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(20,16,12,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // snow/scree caps on the taller peaks
  ctx.fillStyle = "rgba(210,205,195,0.15)";
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (yBase - p.y > peakHeight * 0.7) {
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y + 10);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x + 8, p.y + 10);
      ctx.fill();
    }
  }
}

/** Small decorative rural compound (non-interactive terrain dressing). */
function drawDecorativeCompound(ctx: CanvasRenderingContext2D, rng: () => number, cx: number, cy: number) {
  const size = 14 + rng() * 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rng() - 0.5) * 0.6);
  ctx.strokeStyle = "rgba(150,135,105,0.35)";
  ctx.fillStyle = "rgba(70,62,46,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  const buildings = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < buildings; i++) {
    const bx = (rng() - 0.5) * size;
    const by = (rng() - 0.5) * size;
    const bw = 5 + rng() * 6;
    const bh = 5 + rng() * 6;
    ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  ctx.strokeStyle = "rgba(180,190,170,0.035)";
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

export function buildTerrainLayer(regions: Region[], bases: Base[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(-WORLD_MIN.x, -WORLD_MIN.y);
  const rng = mulberry32(0xf20a7e1);

  ctx.fillStyle = "#221d15";
  ctx.fillRect(WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);

  paintGround(ctx, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  scatterGroundTexture(ctx, rng, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);

  // mountain ridgelines ringing and crossing the wider world — this is most
  // of what makes panning outward feel like a real, huge landscape
  const rangeCount = 10;
  for (let i = 0; i < rangeCount; i++) {
    const x0 = WORLD_MIN.x + rng() * WORLD_W * 0.9;
    const yBase = WORLD_MIN.y + rng() * WORLD_H;
    const length = 300 + rng() * 700;
    const peak = 60 + rng() * 140;
    drawMountainRange(ctx, rng, x0, yBase, length, peak, rng() > 0.5);
  }

  // scattered decorative rural compounds across the wider world (not
  // interactive — just makes the huge map feel inhabited when you pan out)
  for (let i = 0; i < 26; i++) {
    const x = WORLD_MIN.x + rng() * WORLD_W;
    const y = WORLD_MIN.y + rng() * WORLD_H;
    if (Math.abs(x - ACTION_CENTER.x) < 700 && Math.abs(y - ACTION_CENTER.y) < 500) continue; // keep the action area clear
    drawDecorativeCompound(ctx, rng, x, y);
  }

  drawGrid(ctx, WORLD_MIN.x, WORLD_MIN.y, WORLD_W, WORLD_H);
  drawRoad(ctx, bases);
  drawRiver(ctx);

  // region borders + labels only — no flat color wash over the terrain
  for (const region of regions) {
    ctx.save();
    clipRegion(ctx, region);
    // very subtle texture variance so friendly vs. contested ground reads
    // without a color wash: a faint patrol-track hatching on friendly soil
    if (region.control !== "enemy") {
      ctx.strokeStyle = "rgba(210,200,170,0.05)";
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

  return canvas;
}
