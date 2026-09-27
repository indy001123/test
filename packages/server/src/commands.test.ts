import { describe, expect, it } from "vitest";
import type { Player } from "@frontline/shared";
import { createInitialState } from "./scenario.js";
import { dispatchConvoy, issueOrder } from "./commands.js";

function player(role: "ground" | "logistics"): Player {
  return { id: "p1", name: "Test", role, connected: true };
}

describe("issueOrder", () => {
  it("rejects orders on units outside the player's role", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const logisticsUnit = state.units.find((u) => u.role === "logistics")!;
    const result = issueOrder(state, player("ground"), logisticsUnit.id, {
      kind: "MOVE",
      targetPosition: { x: 100, y: 100 },
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid move order and clamps out-of-bounds targets", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const groundUnit = state.units.find((u) => u.role === "ground")!;
    const result = issueOrder(state, player("ground"), groundUnit.id, {
      kind: "MOVE",
      targetPosition: { x: 99999, y: -500 },
    });
    expect(result.ok).toBe(true);
    expect(groundUnit.order?.targetPosition!.x).toBeLessThanOrEqual(1000);
    expect(groundUnit.order?.targetPosition!.y).toBeGreaterThanOrEqual(0);
  });
});

describe("dispatchConvoy", () => {
  it("rejects dispatch from a non-logistics player", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const result = dispatchConvoy(state, player("ground"), "base-alpha", "base-bravo", {
      fuel: 10,
      supplies: 0,
      ammo: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("allows a logistics player to dispatch a valid convoy", () => {
    const state = createInitialState("c1", "SEED-A");
    state.phase = "active";
    const result = dispatchConvoy(state, player("logistics"), "base-alpha", "base-bravo", {
      fuel: 10,
      supplies: 0,
      ammo: 0,
    });
    expect(result.ok).toBe(true);
    expect(state.convoys).toHaveLength(1);
  });
});
