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
