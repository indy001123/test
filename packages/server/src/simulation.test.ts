import { describe, expect, it } from "vitest";
import { createInitialState } from "./scenario.js";
import { createConvoy, tick, type SimContext } from "./simulation.js";
import { Rng } from "./rng.js";

function freshContext(): SimContext {
  return { bravoZeroFuelStreak: 0, objectiveResolved: false };
}

describe("scenario", () => {
  it("builds two bases, one enemy contact, and an objective", () => {
    const state = createInitialState("c1", "TEST-SEED");
    expect(state.bases).toHaveLength(2);
    expect(state.units.length).toBeGreaterThanOrEqual(5);
    expect(state.contacts).toHaveLength(1);
    expect(state.objective.complete).toBe(false);
  });

  it("is deterministic for a given seed", () => {
    const a = createInitialState("c1", "SAME-SEED");
    const b = createInitialState("c2", "SAME-SEED");
    expect(a.units.map((u) => u.type)).toEqual(b.units.map((u) => u.type));
    expect(a.bases.map((b2) => b2.resources)).toEqual(b.bases.map((b2) => b2.resources));
  });
});

describe("tick", () => {
  it("does nothing while campaign is not active", () => {
    const state = createInitialState("c1", "SEED-A");
    const rng = new Rng("SEED-A");
    const before = state.tick;
    tick(state, rng, freshContext());
    expect(state.tick).toBe(before);
  });

  it("drains base upkeep each tick once active", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const rng = new Rng("SEED-A");
    const bravo = state.bases.find((b) => b.id === "base-bravo")!;
    const fuelBefore = bravo.resources.fuel;
    tick(state, rng, freshContext());
    expect(bravo.resources.fuel).toBeLessThan(fuelBefore);
    expect(state.tick).toBe(1);
  });

  it("fails the objective once Bravo stays out of fuel too long", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const bravo = state.bases.find((b) => b.id === "base-bravo")!;
    bravo.resources.fuel = 0;
    bravo.upkeepPerTick.fuel = 0; // isolate the zero-fuel-streak behavior
    const rng = new Rng("SEED-A");
    const ctx = freshContext();
    for (let i = 0; i < 40; i++) tick(state, rng, ctx);
    expect(state.phase).toBe("failed");
    expect(state.objective.failed).toBe(true);
  });
});

describe("createConvoy", () => {
  it("refuses to dispatch more than the origin base has", () => {
    const state = createInitialState("c1", "SEED-A");
    const alpha = state.bases.find((b) => b.id === "base-alpha")!;
    const convoy = createConvoy(state, alpha.id, "base-bravo", { fuel: 999999, supplies: 0, ammo: 0 });
    expect(convoy).toBeNull();
  });

  it("deducts cargo from origin and delivers it to destination on arrival", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const alpha = state.bases.find((b) => b.id === "base-alpha")!;
    const bravo = state.bases.find((b) => b.id === "base-bravo")!;
    const fuelBefore = alpha.resources.fuel;
    const bravoFuelBefore = bravo.resources.fuel;
    const convoy = createConvoy(state, alpha.id, bravo.id, { fuel: 100, supplies: 50, ammo: 0 });
    expect(convoy).not.toBeNull();
    expect(alpha.resources.fuel).toBe(fuelBefore - 100);

    const rng = new Rng("SEED-A");
    const ctx = freshContext();
    for (let i = 0; i < 200 && state.convoys.length > 0; i++) tick(state, rng, ctx);

    expect(state.convoys).toHaveLength(0);
    expect(bravo.resources.fuel).toBeGreaterThan(bravoFuelBefore);
    expect(state.objective.progress).toBeGreaterThan(0);
  });
});
