// Core domain types shared between server (authoritative) and client (rendering).
// Kept intentionally small for the vertical-slice milestone; new unit/event/region
// data should be added as data (see data.ts), not new type variants, where possible.

export type Role = "ground" | "air" | "logistics" | "intel";

export interface Vector2 {
  x: number;
  y: number;
}

export type RegionId = string;
export type BaseId = string;
export type UnitId = string;
export type ConvoyId = string;
export type ContactId = string;
export type PlayerId = string;

export interface ResourcePool {
  fuel: number;
  supplies: number;
  ammo: number;
}

export function zeroResources(): ResourcePool {
  return { fuel: 0, supplies: 0, ammo: 0 };
}

export type RegionControl = "friendly" | "contested" | "enemy";

export interface Region {
  id: RegionId;
  name: string;
  /** Polygon in world-space map units, used for both hit-testing and rendering. */
  path: Vector2[];
  control: RegionControl;
  /** 0..1 abstract measure of how hard the enemy is pressing this region. */
  enemyPressure: number;
}

export interface Base {
  id: BaseId;
  name: string;
  regionId: RegionId;
  position: Vector2;
  resources: ResourcePool;
  maxResources: ResourcePool;
  /** Resources consumed per tick just to keep the base running. */
  upkeepPerTick: ResourcePool;
  isIsolated: boolean;
  isPlayerControlled: boolean;
}

export type UnitCategory =
  | "infantry"
  | "recon"
  | "armor"
  | "transport"
  | "supply_truck"
  | "fuel_truck";

export interface UnitDef {
  type: UnitCategory;
  role: Role;
  label: string;
  speed: number; // world units / tick
  reconRange: number; // world units, for fog-of-war reveal
  fuelUsePerTick: number;
}

export type OrderKind = "MOVE" | "PATROL" | "DEFEND" | "RECON" | "RESUPPLY" | "WITHDRAW";

export interface Order {
  kind: OrderKind;
  targetPosition?: Vector2;
  targetBaseId?: BaseId;
  issuedAtTick: number;
}

export type UnitStatus = "idle" | "moving" | "patrolling" | "defending" | "returning";

export interface Unit {
  id: UnitId;
  type: UnitCategory;
  role: Role;
  homeBaseId: BaseId;
  position: Vector2;
  status: UnitStatus;
  order: Order | null;
  fuel: number;
  maxFuel: number;
  readiness: number; // 0..100
}

export type ConvoyStatus = "forming" | "enroute" | "delayed" | "arrived" | "lost";

export interface Convoy {
  id: ConvoyId;
  fromBaseId: BaseId;
  toBaseId: BaseId;
  cargo: ResourcePool;
  position: Vector2;
  progress: number; // 0..1
  status: ConvoyStatus;
  etaTick: number;
}

export type ContactStatus = "suspected" | "probable" | "confirmed" | "lost";

export interface EnemyContact {
  id: ContactId;
  position: Vector2;
  regionId: RegionId;
  confidence: number; // 0..100
  status: ContactStatus;
  firstSeenTick: number;
  lastSeenTick: number;
  corroborated: boolean;
}

export type EventSeverity = "info" | "warning" | "critical";

export interface GameEvent {
  id: string;
  tick: number;
  severity: EventSeverity;
  text: string;
  regionId?: RegionId;
  baseId?: BaseId;
  unitId?: UnitId;
  convoyId?: ConvoyId;
}

export interface Objective {
  id: string;
  description: string;
  target: number;
  progress: number;
  complete: boolean;
  failed: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  role: Role | null;
  connected: boolean;
}

export type CampaignPhase = "lobby" | "active" | "complete" | "failed";

export interface CampaignState {
  campaignId: string;
  seed: string;
  phase: CampaignPhase;
  tick: number;
  elapsedSec: number;
  regions: Region[];
  bases: Base[];
  units: Unit[];
  convoys: Convoy[];
  contacts: EnemyContact[];
  events: GameEvent[];
  objective: Objective;
  players: Player[];
}

// ---- Wire protocol ----

export type ClientMessage =
  | { type: "join"; campaignId: string; name: string; playerId?: PlayerId }
  | { type: "chooseRole"; role: Role }
  | { type: "startCampaign" }
  | { type: "issueOrder"; unitId: UnitId; order: Omit<Order, "issuedAtTick"> }
  | { type: "dispatchConvoy"; fromBaseId: BaseId; toBaseId: BaseId; cargo: ResourcePool }
  | { type: "chat"; text: string };

export type ServerMessage =
  | { type: "joined"; playerId: PlayerId; campaignId: string }
  | { type: "lobbyState"; players: Player[]; campaignId: string; seed: string }
  | { type: "stateUpdate"; state: CampaignState }
  | { type: "chat"; playerId: PlayerId; name: string; text: string; tick: number }
  | { type: "error"; message: string };
