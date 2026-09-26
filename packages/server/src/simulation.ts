import type { Base, CampaignState, Convoy, EnemyContact, GameEvent, Unit } from "@frontline/shared";
import { UNIT_DEFS, clamp, distance, lerp, moveToward } from "@frontline/shared";
import { Rng } from "./rng.js";
import { makeContactId, makeConvoyId, makeEventId } from "./scenario.js";

export interface SimContext {
  bravoZeroFuelStreak: number;
  objectiveResolved: boolean;
}

const CONVOY_SPEED = 12; // world units per tick
const CONTACT_SPEED = 4;
const REVEAL_MARGIN = 1.15; // recon range multiplier for spotting
const BASE_PASSIVE_RECON = 40;
const ZERO_FUEL_FAIL_TICKS = 30; // ~15s at 2 ticks/sec
const MAX_EVENTS = 60;

function pushEvent(state: CampaignState, e: Omit<GameEvent, "id" | "tick">) {
  state.events.push({ ...e, id: makeEventId(), tick: state.tick });
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

function addResources(base: Base, cargo: { fuel: number; supplies: number; ammo: number }) {
  base.resources.fuel = clamp(base.resources.fuel + cargo.fuel, 0, base.maxResources.fuel);
  base.resources.supplies = clamp(base.resources.supplies + cargo.supplies, 0, base.maxResources.supplies);
  base.resources.ammo = clamp(base.resources.ammo + cargo.ammo, 0, base.maxResources.ammo);
}

function tickUnits(state: CampaignState) {
  for (const unit of state.units) {
    const def = UNIT_DEFS[unit.type];
    if (unit.order && (unit.status === "moving" || unit.status === "patrolling")) {
      const target = unit.order.targetPosition;
      if (target) {
        unit.position = moveToward(unit.position, target, def.speed);
        unit.fuel = clamp(unit.fuel - def.fuelUsePerTick, 0, unit.maxFuel);
        if (distance(unit.position, target) < 1) {
          if (unit.order.kind === "PATROL") {
            // simple back-and-forth: swap target with origin on arrival
            unit.order = { ...unit.order, targetPosition: { ...unit.position } };
            unit.status = "patrolling";
          } else {
            unit.status = unit.order.kind === "DEFEND" ? "defending" : "idle";
            if (unit.order.kind !== "DEFEND") unit.order = null;
          }
        }
        if (unit.fuel <= 0) {
          unit.status = "idle";
          unit.readiness = clamp(unit.readiness - 1, 0, 100);
        }
      }
    }
  }
}

function tickBases(state: CampaignState, ctx: SimContext) {
  for (const base of state.bases) {
    base.resources.fuel = clamp(base.resources.fuel - base.upkeepPerTick.fuel, 0, base.maxResources.fuel);
    base.resources.supplies = clamp(base.resources.supplies - base.upkeepPerTick.supplies, 0, base.maxResources.supplies);
    base.resources.ammo = clamp(base.resources.ammo - base.upkeepPerTick.ammo, 0, base.maxResources.ammo);
    base.isIsolated = base.resources.fuel <= 0 && base.id === "base-bravo";

    if (base.id === "base-bravo") {
      if (base.resources.fuel <= 0) {
        ctx.bravoZeroFuelStreak += 1;
      } else {
        ctx.bravoZeroFuelStreak = 0;
      }
    }
  }
}

function tickConvoys(state: CampaignState, rng: Rng) {
  for (const convoy of state.convoys) {
    if (convoy.status === "arrived" || convoy.status === "lost") continue;
    if (convoy.status === "delayed") {
      // small chance per tick the delay clears
      if (rng.chance(0.3)) convoy.status = "enroute";
      continue;
    }
    const from = state.bases.find((b) => b.id === convoy.fromBaseId);
    const to = state.bases.find((b) => b.id === convoy.toBaseId);
    if (!from || !to) continue;
    const totalDist = distance(from.position, to.position);
    const stepFraction = CONVOY_SPEED / Math.max(totalDist, 1);
    convoy.progress = clamp(convoy.progress + stepFraction, 0, 1);
    convoy.position = {
      x: lerp(from.position.x, to.position.x, convoy.progress),
      y: lerp(from.position.y, to.position.y, convoy.progress),
    };
    if (convoy.progress >= 1) {
      convoy.status = "arrived";
      addResources(to, convoy.cargo);
      const delivered = convoy.cargo.fuel + convoy.cargo.supplies + convoy.cargo.ammo;
      state.objective.progress = clamp(state.objective.progress + delivered, 0, state.objective.target);
      pushEvent(state, {
        severity: "info",
        text: `Convoy arrived at ${to.name}: +${convoy.cargo.fuel} fuel, +${convoy.cargo.supplies} supplies, +${convoy.cargo.ammo} ammo.`,
        baseId: to.id,
        convoyId: convoy.id,
      });
    }
  }
  // drop terminal convoys after they've been visible for a moment
  state.convoys = state.convoys.filter((c) => c.status !== "arrived" && c.status !== "lost");
}

function tickEnemy(state: CampaignState, rng: Rng) {
  const bravo = state.bases.find((b) => b.id === "base-bravo");
  for (const contact of state.contacts) {
    // seek weakly-defended friendly base, but avoid strong nearby forces
    const nearbyUnits = state.units.filter((u) => distance(u.position, contact.position) < 90);
    const target = bravo ?? state.bases[0];
    let dir = { x: 0, y: 0 };
    if (nearbyUnits.length >= 2) {
      // avoid: move away from the centroid of nearby defenders
      const cx = nearbyUnits.reduce((s, u) => s + u.position.x, 0) / nearbyUnits.length;
      const cy = nearbyUnits.reduce((s, u) => s + u.position.y, 0) / nearbyUnits.length;
      dir = { x: contact.position.x - cx, y: contact.position.y - cy };
    } else if (target) {
      dir = { x: target.position.x - contact.position.x, y: target.position.y - contact.position.y };
    }
    const len = Math.hypot(dir.x, dir.y) || 1;
    contact.position = {
      x: contact.position.x + (dir.x / len) * CONTACT_SPEED,
      y: contact.position.y + (dir.y / len) * CONTACT_SPEED,
    };

    let seen = false;
    let observers = 0;
    for (const unit of state.units) {
      const def = UNIT_DEFS[unit.type];
      if (distance(unit.position, contact.position) <= def.reconRange * REVEAL_MARGIN) {
        seen = true;
        observers += 1;
      }
    }
    for (const base of state.bases) {
      if (distance(base.position, contact.position) <= BASE_PASSIVE_RECON) seen = true;
    }

    if (seen) {
      contact.confidence = clamp(contact.confidence + 15, 0, 100);
      contact.lastSeenTick = state.tick;
      contact.corroborated = observers >= 2;
    } else {
      contact.confidence = clamp(contact.confidence - 4, 0, 100);
    }

    const ticksSinceSeen = state.tick - contact.lastSeenTick;
    if (!seen && ticksSinceSeen > 10) {
      contact.status = "lost";
    } else if (contact.confidence >= 70) {
      contact.status = "confirmed";
    } else if (contact.confidence >= 40) {
      contact.status = "probable";
    } else {
      contact.status = "suspected";
    }
  }

  // occasionally spawn a second contact to keep intel work meaningful
  if (state.contacts.length < 2 && rng.chance(0.01)) {
    const ridge = state.regions.find((r) => r.control === "enemy");
    if (ridge) {
      const p = ridge.path[Math.floor(rng.float() * ridge.path.length)];
      state.contacts.push({
        id: makeContactId(),
        position: { x: p.x, y: p.y },
        regionId: ridge.id,
        confidence: 15,
        status: "suspected",
        firstSeenTick: state.tick,
        lastSeenTick: state.tick,
        corroborated: false,
      });
      pushEvent(state, { severity: "warning", text: "Unconfirmed movement detected near Sarrow Ridge." });
    }
  }
}

function tickRandomEvents(state: CampaignState, rng: Rng) {
  if (rng.chance(0.015)) {
    const enroute = state.convoys.find((c) => c.status === "enroute");
    if (enroute) {
      enroute.status = "delayed";
      pushEvent(state, {
        severity: "warning",
        text: "Convoy reports a mechanical problem and is delayed.",
        convoyId: enroute.id,
      });
    }
  }
  if (rng.chance(0.01)) {
    const groundUnits = state.units.filter((u) => u.role === "ground" || u.role === "logistics");
    const unit = groundUnits[Math.floor(rng.float() * groundUnits.length)];
    if (unit) {
      unit.readiness = clamp(unit.readiness - 15, 0, 100);
      pushEvent(state, {
        severity: "warning",
        text: `${UNIT_DEFS[unit.type].label} reports reduced readiness after a mechanical issue.`,
        unitId: unit.id,
      });
    }
  }
  if (rng.chance(0.008)) {
    pushEvent(state, { severity: "info", text: "Communications flicker across the valley network. No data lost." });
  }
}

export function tick(state: CampaignState, rng: Rng, ctx: SimContext) {
  if (state.phase !== "active") return;
  state.tick += 1;
  state.elapsedSec += 0.5;

  tickUnits(state);
  tickBases(state, ctx);
  tickConvoys(state, rng);
  tickEnemy(state, rng);
  tickRandomEvents(state, rng);

  if (!ctx.objectiveResolved) {
    if (state.objective.progress >= state.objective.target) {
      state.objective.complete = true;
      state.phase = "complete";
      ctx.objectiveResolved = true;
      pushEvent(state, { severity: "info", text: "OBJECTIVE COMPLETE: Forward Base Bravo has been stabilized." });
    } else if (ctx.bravoZeroFuelStreak > ZERO_FUEL_FAIL_TICKS) {
      state.objective.failed = true;
      state.phase = "failed";
      ctx.objectiveResolved = true;
      pushEvent(state, { severity: "critical", text: "FORWARD BASE BRAVO HAS RUN OUT OF FUEL AND GONE DARK." });
    }
  }
}

export function createConvoy(state: CampaignState, fromBaseId: string, toBaseId: string, cargo: { fuel: number; supplies: number; ammo: number }): Convoy | null {
  const from = state.bases.find((b) => b.id === fromBaseId);
  const to = state.bases.find((b) => b.id === toBaseId);
  if (!from || !to) return null;
  if (from.resources.fuel < cargo.fuel || from.resources.supplies < cargo.supplies || from.resources.ammo < cargo.ammo) {
    return null;
  }
  from.resources.fuel -= cargo.fuel;
  from.resources.supplies -= cargo.supplies;
  from.resources.ammo -= cargo.ammo;
  const convoy: Convoy = {
    id: makeConvoyId(),
    fromBaseId,
    toBaseId,
    cargo,
    position: { ...from.position },
    progress: 0,
    status: "enroute",
    etaTick: state.tick + Math.ceil(distance(from.position, to.position) / CONVOY_SPEED),
  };
  state.convoys.push(convoy);
  pushEvent(state, {
    severity: "info",
    text: `Convoy dispatched from ${from.name} to ${to.name} carrying ${cargo.fuel} fuel, ${cargo.supplies} supplies, ${cargo.ammo} ammo.`,
    baseId: to.id,
    convoyId: convoy.id,
  });
  return convoy;
}

export { pushEvent };
