import type {
  Base,
  CampaignState,
  EnemyContact,
  Objective,
  Region,
  Unit,
  UnitCategory,
} from "@frontline/shared";
import { UNIT_DEFS } from "@frontline/shared";
import { Rng } from "./rng.js";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const KARSAN_VALLEY: Region = {
  id: "region-karsan-valley",
  name: "Karsan Valley",
  path: [
    { x: 40, y: 40 },
    { x: 620, y: 40 },
    { x: 620, y: 560 },
    { x: 40, y: 560 },
  ],
  control: "friendly",
  enemyPressure: 0.1,
};

const SARROW_RIDGE: Region = {
  id: "region-sarrow-ridge",
  name: "Sarrow Ridge",
  path: [
    { x: 620, y: 40 },
    { x: 960, y: 40 },
    { x: 960, y: 560 },
    { x: 620, y: 560 },
  ],
  control: "enemy",
  enemyPressure: 0.6,
};

function makeUnit(type: UnitCategory, homeBaseId: string, position: { x: number; y: number }): Unit {
  const def = UNIT_DEFS[type];
  return {
    id: nextId("unit"),
    type,
    role: def.role,
    homeBaseId,
    position: { ...position },
    status: "idle",
    order: null,
    fuel: 100,
    maxFuel: 100,
    readiness: 100,
  };
}

/** Builds the vertical-slice scenario: one contested valley, two bases, one enemy region. */
export function createInitialState(campaignId: string, seed: string): CampaignState {
  idCounter = 0;
  const rng = new Rng(seed);

  const alpha: Base = {
    id: "base-alpha",
    name: "Forward Base Alpha",
    regionId: KARSAN_VALLEY.id,
    position: { x: 200, y: 300 },
    resources: { fuel: 600, supplies: 500, ammo: 400 },
    maxResources: { fuel: 800, supplies: 800, ammo: 600 },
    upkeepPerTick: { fuel: 0.6, supplies: 0.5, ammo: 0.1 },
    isIsolated: false,
    isPlayerControlled: true,
  };

  const bravo: Base = {
    id: "base-bravo",
    name: "Forward Base Bravo",
    regionId: KARSAN_VALLEY.id,
    position: { x: 560, y: 160 },
    resources: { fuel: 120, supplies: 90, ammo: 150 },
    maxResources: { fuel: 400, supplies: 400, ammo: 300 },
    upkeepPerTick: { fuel: 1.4, supplies: 1.1, ammo: 0.15 },
    isIsolated: false,
    isPlayerControlled: true,
  };

  const units: Unit[] = [
    makeUnit("infantry", alpha.id, { x: 210, y: 320 }),
    makeUnit("infantry", alpha.id, { x: 190, y: 280 }),
    makeUnit("recon", alpha.id, { x: 230, y: 300 }),
    makeUnit("armor", alpha.id, { x: 220, y: 340 }),
    makeUnit("infantry", bravo.id, { x: 555, y: 175 }),
    makeUnit("supply_truck", alpha.id, { x: 205, y: 310 }),
    makeUnit("supply_truck", alpha.id, { x: 195, y: 295 }),
    makeUnit("fuel_truck", alpha.id, { x: 215, y: 305 }),
  ];

  const enemyContacts: EnemyContact[] = [
    {
      id: nextId("contact"),
      position: { x: 700, y: 200 },
      regionId: SARROW_RIDGE.id,
      confidence: 20,
      status: "suspected",
      firstSeenTick: 0,
      lastSeenTick: 0,
      corroborated: false,
    },
  ];

  const objective: Objective = {
    id: "objective-resupply-bravo",
    description:
      "Forward Base Bravo is under-supplied and exposed. Deliver at least 200 combined fuel+supplies via convoy before it runs dry.",
    target: 200,
    progress: 0,
    complete: false,
    failed: false,
  };

  return {
    campaignId,
    seed,
    phase: "lobby",
    tick: 0,
    elapsedSec: 0,
    regions: [KARSAN_VALLEY, SARROW_RIDGE],
    bases: [alpha, bravo],
    units,
    convoys: [],
    contacts: enemyContacts,
    events: [
      {
        id: nextId("event"),
        tick: 0,
        severity: "info",
        text: "Campaign initialized. Awaiting commanders.",
      },
    ],
    objective,
    players: [],
  };
}

export function makeContactId(): string {
  return nextId("contact");
}

export function makeConvoyId(): string {
  return nextId("convoy");
}

export function makeEventId(): string {
  return nextId("event");
}

export { rngFor };
function rngFor(seed: string): Rng {
  return new Rng(seed);
}
