// End-to-end smoke test: boots the real server, drives two WebSocket clients
// through join -> role select -> start -> orders -> convoy dispatch, and
// asserts state actually flows and changes as a real multiplayer session
// would. Run with `npm run smoke` after `npm run build`.
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = 8099;
const WS_URL = `ws://localhost:${PORT}/ws`;
const CAMPAIGN_ID = `SMOKE-${Date.now()}`;

function log(...args) {
  console.log("[smoke]", ...args);
}

function fail(msg) {
  console.error("[smoke] FAIL:", msg);
  process.exitCode = 1;
}

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not become healthy in time");
}

class Client {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket(WS_URL);
    this.messages = [];
    this.latestState = null;
    this.playerId = null;
    this.ready = new Promise((resolve) => {
      this.ws.on("open", resolve);
    });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      this.messages.push(msg);
      if (msg.type === "joined") this.playerId = msg.playerId;
      if (msg.type === "stateUpdate") this.latestState = msg.state;
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  async waitFor(predicate, timeoutMs = 8000, label = "condition") {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate(this.messages, this.latestState)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`${this.name}: timed out waiting for ${label}`);
  }
}

async function main() {
  log("starting server on port", PORT);
  const server = spawn(process.execPath, [path.join(root, "packages/server/dist/server.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[server-err] ${d}`));

  try {
    await waitForServer(`http://localhost:${PORT}/health`);
    log("server healthy");

    const ground = new Client("ground-player");
    const logistics = new Client("logistics-player");
    await Promise.all([ground.ready, logistics.ready]);

    ground.send({ type: "join", campaignId: CAMPAIGN_ID, name: "Alice" });
    logistics.send({ type: "join", campaignId: CAMPAIGN_ID, name: "Bob" });
    await ground.waitFor((m) => m.some((x) => x.type === "joined"), 3000, "join ack");
    await logistics.waitFor((m) => m.some((x) => x.type === "joined"), 3000, "join ack");
    log("both players joined campaign", CAMPAIGN_ID);

    ground.send({ type: "chooseRole", role: "ground" });
    logistics.send({ type: "chooseRole", role: "logistics" });
    await ground.waitFor(
      (m) => m.some((x) => x.type === "lobbyState" && x.players.every((p) => p.role)),
      3000,
      "both roles assigned"
    );
    log("roles assigned: ground + logistics");

    ground.send({ type: "startCampaign" });
    await ground.waitFor((_, s) => s?.phase === "active", 3000, "campaign active");
    await logistics.waitFor((_, s) => s?.phase === "active", 3000, "campaign active (logistics view)");
    log("campaign is active; two-player sync confirmed");

    // cross-player visibility: logistics client should see the same units ground owns
    const groundUnit = logistics.latestState.units.find((u) => u.role === "ground");
    if (!groundUnit) throw new Error("logistics client cannot see ground units - sync broken");
    log("cross-client state sync verified (logistics sees ground units)");

    // Ground issues a move order
    const myGroundUnit = ground.latestState.units.find((u) => u.role === "ground");
    const dest = { x: myGroundUnit.position.x + 50, y: myGroundUnit.position.y };
    ground.send({ type: "issueOrder", unitId: myGroundUnit.id, order: { kind: "MOVE", targetPosition: dest } });
    await ground.waitFor(
      (_, s) => {
        const u = s?.units.find((x) => x.id === myGroundUnit.id);
        return u && (u.position.x !== myGroundUnit.position.x || u.status === "idle");
      },
      5000,
      "unit to move"
    );
    log("ground unit responded to MOVE order");

    // Server should reject a ground player ordering a logistics unit
    const logisticsUnit = ground.latestState.units.find((u) => u.role === "logistics");
    ground.send({ type: "issueOrder", unitId: logisticsUnit.id, order: { kind: "MOVE", targetPosition: { x: 0, y: 0 } } });
    await ground.waitFor((m) => m.some((x) => x.type === "error"), 2000, "rejection of cross-role order");
    log("server correctly rejected cross-role order");

    // Logistics dispatches a convoy from Alpha to Bravo
    const alphaBefore = logistics.latestState.bases.find((b) => b.id === "base-alpha");
    logistics.send({
      type: "dispatchConvoy",
      fromBaseId: "base-alpha",
      toBaseId: "base-bravo",
      cargo: { fuel: 80, supplies: 40, ammo: 0 },
    });
    await logistics.waitFor((_, s) => s?.convoys.length > 0, 3000, "convoy created");
    log("convoy dispatched");

    const alphaAfter = logistics.latestState.bases.find((b) => b.id === "base-alpha");
    if (alphaAfter.resources.fuel >= alphaBefore.resources.fuel) {
      throw new Error("origin base fuel was not deducted for the convoy");
    }
    log("origin base resources deducted correctly");

    // Wait for convoy to arrive and objective progress to increase
    await logistics.waitFor((_, s) => s.objective.progress > 0, 20000, "objective progress after convoy arrival");
    log("convoy arrived and objective progress increased:", logistics.latestState.objective.progress);

    // Chat round-trip
    ground.send({ type: "chat", text: "resupply inbound to bravo" });
    await logistics.waitFor((m) => m.some((x) => x.type === "chat" && x.text.includes("resupply inbound")), 2000, "chat delivery");
    log("chat message delivered to teammate");

    log("ALL SMOKE CHECKS PASSED");
  } catch (err) {
    fail(err.message);
  } finally {
    server.kill();
  }
}

main();
