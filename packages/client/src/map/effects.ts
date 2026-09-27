import type { Vector2 } from "@frontline/shared";

/** Soft contact shadow so icons read as sitting on the ground, not floating on it. */
export function drawGroundShadow(ctx: CanvasRenderingContext2D, pos: Vector2, rx: number, ry: number) {
  ctx.save();
  ctx.translate(pos.x, pos.y + ry * 0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.restore();
}

/** Soft drifting cloud shadows over the terrain — cheap, world-space blobs
 * whose position is a function of time, so the map feels alive even when
 * nothing else is moving. Call once per frame with a handful of `sources`. */
export function drawCloudShadows(ctx: CanvasRenderingContext2D, sources: { x: number; y: number; r: number; speed: number }[], timeMs: number) {
  for (const c of sources) {
    const dx = ((timeMs * c.speed) % 4000) - 2000;
    ctx.beginPath();
    ctx.ellipse(c.x + dx, c.y, c.r, c.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fill();
  }
}

/** A few bright glints that travel along the river's course over time, so
 * the water reads as flowing rather than a static painted ribbon. */
export function drawRiverSparkle(ctx: CanvasRenderingContext2D, points: Vector2[], timeMs: number, glintCount = 5) {
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return;

  for (let g = 0; g < glintCount; g++) {
    const speed = 40; // world units / second
    const offset = (g / glintCount) * totalLen;
    const dist = (((timeMs / 1000) * speed + offset) % totalLen + totalLen) % totalLen;
    let remaining = dist;
    let seg = 0;
    while (seg < segLens.length && remaining > segLens[seg]) {
      remaining -= segLens[seg];
      seg++;
    }
    if (seg >= segLens.length) continue;
    const a = points[seg];
    const b = points[seg + 1];
    const t = segLens[seg] > 0 ? remaining / segLens[seg] : 0;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const pulse = 0.4 + 0.4 * Math.sin(timeMs / 300 + g * 2);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220,240,245,${pulse})`;
    ctx.fill();
  }
}

/** A small compass rose HUD element — screen space, doesn't scale with zoom. */
export function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,15,22,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200,210,220,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(4, 2);
  ctx.lineTo(0, -2);
  ctx.lineTo(-4, 2);
  ctx.closePath();
  ctx.fillStyle = "#e0453a";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 13);
  ctx.lineTo(4, -2);
  ctx.lineTo(0, 2);
  ctx.lineTo(-4, -2);
  ctx.closePath();
  ctx.fillStyle = "rgba(220,227,235,0.7)";
  ctx.fill();
  ctx.font = "700 8px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "rgba(220,227,235,0.8)";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -19);
  ctx.textAlign = "left";
  ctx.restore();
}

/** A slow-drifting smoke wisp, looped by `timeMs`. Cheap enough to call per
 * source per frame — a handful of sources across the front line at most. */
export function drawSmokeWisp(ctx: CanvasRenderingContext2D, pos: Vector2, timeMs: number, seedOffset: number) {
  const loopMs = 6000;
  const puffs = 3;
  for (let i = 0; i < puffs; i++) {
    const phase = ((timeMs + seedOffset * 1000 + (i * loopMs) / puffs) % loopMs) / loopMs;
    const rise = phase * 34;
    const drift = Math.sin(phase * Math.PI * 2 + seedOffset) * 4;
    const alpha = Math.sin(phase * Math.PI) * 0.16;
    if (alpha <= 0.005) continue;
    const r = 3 + phase * 9;
    ctx.beginPath();
    ctx.arc(pos.x + drift, pos.y - 6 - rise, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(150,150,145,${alpha})`;
    ctx.fill();
  }
}
