import type { UnitCategory, UnitDef } from "./types.js";

// Data-driven unit definitions (section 45/58 of the design spec: aggregate
// stats, no per-unit simulation complexity beyond what the game needs).
export const UNIT_DEFS: Record<UnitCategory, UnitDef> = {
  infantry: { type: "infantry", role: "ground", label: "Infantry Squad", speed: 6, reconRange: 30, fuelUsePerTick: 0.2 },
  recon: { type: "recon", role: "ground", label: "Recon Team", speed: 10, reconRange: 60, fuelUsePerTick: 0.4 },
  armor: { type: "armor", role: "ground", label: "Armored Vehicle", speed: 7, reconRange: 25, fuelUsePerTick: 1.2 },
  transport: { type: "transport", role: "ground", label: "Transport Truck", speed: 8, reconRange: 15, fuelUsePerTick: 0.8 },
  supply_truck: { type: "supply_truck", role: "logistics", label: "Supply Truck", speed: 7, reconRange: 15, fuelUsePerTick: 0.7 },
  fuel_truck: { type: "fuel_truck", role: "logistics", label: "Fuel Truck", speed: 7, reconRange: 15, fuelUsePerTick: 0.7 },
};

export const SIM_TICK_MS = 500; // 2 ticks/sec authoritative simulation rate
export const TICKS_PER_SEC = 1000 / SIM_TICK_MS;
