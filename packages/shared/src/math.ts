import type { Vector2 } from "./types.js";

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function moveToward(from: Vector2, to: Vector2, maxStep: number): Vector2 {
  const d = distance(from, to);
  if (d <= maxStep || d === 0) return { x: to.x, y: to.y };
  const t = maxStep / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}
