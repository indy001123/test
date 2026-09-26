import type { WebSocket } from "ws";
import type { CampaignState, ClientMessage, Player, PlayerId, Role, ServerMessage } from "@frontline/shared";
import { SIM_TICK_MS } from "@frontline/shared";
import { createInitialState } from "./scenario.js";
import { tick, type SimContext } from "./simulation.js";
import { dispatchConvoy, issueOrder } from "./commands.js";
import { Rng } from "./rng.js";

const ASSIGNABLE_ROLES: Role[] = ["ground", "logistics"];

interface ConnectedClient {
  ws: WebSocket;
  playerId: PlayerId;
}

export class CampaignRoom {
  state: CampaignState;
  private clients: Map<PlayerId, ConnectedClient> = new Map();
  private rng: Rng;
  private ctx: SimContext = { bravoZeroFuelStreak: 0, objectiveResolved: false };
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(campaignId: string, seed: string) {
    this.state = createInitialState(campaignId, seed);
    this.rng = new Rng(seed);
  }

  get campaignId() {
    return this.state.campaignId;
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage) {
    for (const client of this.clients.values()) this.send(client.ws, msg);
  }

  private broadcastLobby() {
    this.broadcast({ type: "lobbyState", players: this.state.players, campaignId: this.campaignId, seed: this.state.seed });
  }

  private broadcastState() {
    this.broadcast({ type: "stateUpdate", state: this.state });
  }

  join(ws: WebSocket, name: string, requestedPlayerId?: PlayerId): Player {
    let player = requestedPlayerId ? this.state.players.find((p) => p.id === requestedPlayerId) : undefined;
    if (player) {
      player.connected = true;
      player.name = name || player.name;
    } else {
      player = { id: cryptoRandomId(), name: name || "Commander", role: null, connected: true };
      this.state.players.push(player);
    }
    this.clients.set(player.id, { ws, playerId: player.id });
    this.send(ws, { type: "joined", playerId: player.id, campaignId: this.campaignId });
    this.broadcastLobby();
    if (this.state.phase === "active") this.send(ws, { type: "stateUpdate", state: this.state });
    return player;
  }

  leave(playerId: PlayerId) {
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    this.clients.delete(playerId);
    this.broadcastLobby();
  }

  handleMessage(playerId: PlayerId, msg: ClientMessage) {
    const player = this.state.players.find((p) => p.id === playerId);
    const client = this.clients.get(playerId);
    if (!player || !client) return;

    switch (msg.type) {
      case "chooseRole": {
        if (!ASSIGNABLE_ROLES.includes(msg.role)) {
          this.send(client.ws, { type: "error", message: "That role is not available yet in this build." });
          return;
        }
        const taken = this.state.players.some((p) => p.role === msg.role && p.connected && p.id !== player.id);
        if (taken) {
          this.send(client.ws, { type: "error", message: "That role is already taken." });
          return;
        }
        player.role = msg.role;
        this.broadcastLobby();
        return;
      }
      case "startCampaign": {
        if (this.state.phase !== "lobby") return;
        const roles = new Set(this.state.players.filter((p) => p.connected).map((p) => p.role));
        if (!roles.has("ground") || !roles.has("logistics")) {
          this.send(client.ws, { type: "error", message: "Need at least one Ground and one Logistics commander to start." });
          return;
        }
        this.state.phase = "active";
        this.startLoop();
        this.broadcastState();
        return;
      }
      case "issueOrder": {
        if (!player.role) return;
        const result = issueOrder(this.state, player, msg.unitId, msg.order);
        if (!result.ok) this.send(client.ws, { type: "error", message: result.message });
        return;
      }
      case "dispatchConvoy": {
        if (!player.role) return;
        const result = dispatchConvoy(this.state, player, msg.fromBaseId, msg.toBaseId, msg.cargo);
        if (!result.ok) this.send(client.ws, { type: "error", message: result.message });
        return;
      }
      case "chat": {
        this.broadcast({ type: "chat", playerId: player.id, name: player.name, text: msg.text, tick: this.state.tick });
        return;
      }
    }
  }

  private startLoop() {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      tick(this.state, this.rng, this.ctx);
      this.broadcastState();
      if (this.state.phase === "complete" || this.state.phase === "failed") {
        this.stopLoop();
      }
    }, SIM_TICK_MS);
  }

  private stopLoop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  isEmpty(): boolean {
    return [...this.clients.values()].length === 0;
  }

  dispose() {
    this.stopLoop();
  }
}

function cryptoRandomId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
