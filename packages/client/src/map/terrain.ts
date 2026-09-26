import type { Base, Region, Vector2 } from "@frontline/shared";

export const VIEW_W = 1000;
export const VIEW_H = 600;

// Small deterministic PRNG so the terrain texture doesn't "shimmer" if this
// ever gets regenerated (e.g. on a resize) — purely cosmetic, not synced
// with the server simulation.
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

function paintRegionBase(ctx: CanvasRenderingContext2D, region: Region) {
  const bounds = region.path.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  const grad = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.minX, bounds.maxY);
  if (region.control === "enemy") {
    grad.addColorStop(0, "#241417");
    grad.addColorStop(1, "#1a0e10");
  } else {
    grad.addColorStop(0, "#152820");
    grad.addColorStop(1, "#0f1c1a");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  return bounds;
}

function scatterTexture(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  region: Region
) {
  const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  const count = Math.floor(area / 900);
  const palette =
    region.control === "enemy"
      ? ["rgba(120,60,50,0.10)", "rgba(90,40,40,0.14)", "rgba(150,80,60,0.06)"]
      : ["rgba(60,110,70,0.12)", "rgba(40,80,60,0.14)", "rgba(90,130,80,0.07)"];
  for (let i = 0; i < count; i++) {
    const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + rng() * (bounds.maxY - bounds.minY);
    const r = 8 + rng() * 22;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
    ctx.fill();
  }
  // a handful of denser "forest" clusters and small "high ground" hatch marks
  const clusters = 5 + Math.floor(rng() * 4);
  for (let c = 0; c < clusters; c++) {
    const cx = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const cy = bounds.minY + rng() * (bounds.maxY - bounds.minY);
    const isHighGround = rng() > 0.6;
    if (isHighGround) {
      ctx.strokeStyle = region.control === "enemy" ? "rgba(150,90,70,0.25)" : "rgba(120,140,110,0.22)";
      ctx.lineWidth = 1;
      for (let h = 0; h < 5; h++) {
        const hx = cx + (rng() - 0.5) * 40;
        const hy = cy + (rng() - 0.5) * 40;
        ctx.beginPath();
        ctx.moveTo(hx - 6, hy + 4);
        ctx.lineTo(hx, hy - 6);
        ctx.lineTo(hx + 6, hy + 4);
        ctx.stroke();
      }
    } else {
      for (let d = 0; d < 14; d++) {
        const dx = cx + (rng() - 0.5) * 55;
        const dy = cy + (rng() - 0.5) * 55;
        ctx.beginPath();
        ctx.arc(dx, dy, 2 + rng() * 3, 0, Math.PI * 2);
        ctx.fillStyle = region.control === "enemy" ? "rgba(110,70,55,0.3)" : "rgba(55,100,65,0.35)";
        ctx.fill();
      }
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(130,160,190,0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= VIEW_W; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
  for (let y = 0; y <= VIEW_H; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
}

function drawRiver(ctx: CanvasRenderingContext2D) {
  const points: Vector2[] = [
    { x: 40, y: 480 },
    { x: 180, y: 430 },
    { x: 260, y: 460 },
    { x: 340, y: 400 },
    { x: 420, y: 380 },
    { x: 500, y: 330 },
    { x: 600, y: 300 },
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
  draw(10, "rgba(30,55,80,0.9)");
  draw(6, "rgba(60,110,150,0.6)");
  draw(2, "rgba(140,190,220,0.35)");
}

function drawRoad(ctx: CanvasRenderingContext2D, bases: Base[]) {
  if (bases.length < 2) return;
  const [a, b] = bases;
  ctx.beginPath();
  ctx.moveTo(a.position.x, a.position.y);
  ctx.lineTo(b.position.x, b.position.y);
  ctx.strokeStyle = "rgba(180,170,150,0.28)";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.strokeStyle = "rgba(230,220,200,0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function buildTerrainLayer(regions: Region[], bases: Base[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext("2d")!;
  const rng = mulberry32(0xf20a7e1);

  ctx.fillStyle = "#070b10";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (const region of regions) {
    ctx.save();
    clipRegion(ctx, region);
    const bounds = paintRegionBase(ctx, region);
    scatterTexture(ctx, rng, bounds, region);
    ctx.restore();
  }

  drawGrid(ctx);
  drawRoad(ctx, bases);
  drawRiver(ctx);

  // region borders + labels (static for the campaign, so baked in once here
  // instead of being re-stroked every animation frame)
  for (const region of regions) {
    ctx.beginPath();
    region.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = region.control === "enemy" ? "rgba(150,60,60,0.55)" : "rgba(70,110,150,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = "600 11px ui-monospace, Consolas, monospace";
    const label = region.name.toUpperCase();
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(5,8,12,0.55)";
    ctx.fillRect(region.path[0].x + 6, region.path[0].y + 8, labelW + 8, 16);
    ctx.fillStyle = "rgba(150,175,200,0.85)";
    ctx.fillText(label, region.path[0].x + 10, region.path[0].y + 20);
  }

  return canvas;
}
