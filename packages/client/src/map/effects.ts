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
