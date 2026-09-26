import type { CampaignState, Order, Player, ResourcePool, UnitId } from "@frontline/shared";
import { UNIT_DEFS, clamp } from "@frontline/shared";
import { createConvoy } from "./simulation.js";

const MAP_BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };

export function issueOrder(
  state: CampaignState,
  player: Player,
  unitId: UnitId,
  order: Omit<Order, "issuedAtTick">
): { ok: true } | { ok: false; message: string } {
  if (state.phase !== "active") return { ok: false, message: "Campaign is not active." };
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { ok: false, message: "Unknown unit." };
  if (unit.role !== player.role) {
    return { ok: false, message: `${UNIT_DEFS[unit.type].label} is not under your command.` };
  }
  if (order.targetPosition) {
    order.targetPosition = {
      x: clamp(order.targetPosition.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX),
      y: clamp(order.targetPosition.y, MAP_BOUNDS.minY, MAP_BOUNDS.maxY),
    };
  }
  unit.order = { ...order, issuedAtTick: state.tick };
  unit.status = order.kind === "DEFEND" ? "moving" : order.kind === "PATROL" ? "patrolling" : "moving";
  return { ok: true };
}

export function dispatchConvoy(
  state: CampaignState,
  player: Player,
  fromBaseId: string,
  toBaseId: string,
  cargo: ResourcePool
): { ok: true } | { ok: false; message: string } {
  if (state.phase !== "active") return { ok: false, message: "Campaign is not active." };
  if (player.role !== "logistics") return { ok: false, message: "Only Logistics Command can dispatch convoys." };
  if (fromBaseId === toBaseId) return { ok: false, message: "Origin and destination must differ." };
  if (cargo.fuel < 0 || cargo.supplies < 0 || cargo.ammo < 0) {
    return { ok: false, message: "Cargo cannot be negative." };
  }
  const convoy = createConvoy(state, fromBaseId, toBaseId, cargo);
  if (!convoy) return { ok: false, message: "Insufficient resources at origin base." };
  return { ok: true };
}
