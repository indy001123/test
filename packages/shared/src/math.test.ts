import { describe, expect, it } from "vitest";
import { clamp, distance, lerp, moveToward } from "./math.js";

describe("distance", () => {
  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("clamp", () => {
  it("clamps within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("interpolates and clamps t", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe("moveToward", () => {
  it("stops exactly at target when within maxStep", () => {
    const result = moveToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 5);
    expect(result).toEqual({ x: 1, y: 0 });
  });

  it("moves only maxStep toward target when far away", () => {
    const result = moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(result.x).toBeCloseTo(4);
    expect(result.y).toBeCloseTo(0);
  });

  it("does not overshoot or divide by zero when already at target", () => {
    const result = moveToward({ x: 5, y: 5 }, { x: 5, y: 5 }, 4);
    expect(result).toEqual({ x: 5, y: 5 });
  });
});
