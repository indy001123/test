import http from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, PlayerId } from "@frontline/shared";
import { CampaignRoom } from "./room.js";

const PORT = Number(process.env.PORT ?? 8080);

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const rooms = new Map<string, CampaignRoom>();

function getOrCreateRoom(campaignId: string): CampaignRoom {
  let room = rooms.get(campaignId);
  if (!room) {
    room = new CampaignRoom(campaignId, campaignId);
    rooms.set(campaignId, room);
  }
  return room;
}

interface SocketMeta {
  campaignId: string;
  playerId: PlayerId;
}

wss.on("connection", (ws: WebSocket) => {
  let meta: SocketMeta | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const room = getOrCreateRoom(msg.campaignId);
      const player = room.join(ws, msg.name, msg.playerId);
      meta = { campaignId: msg.campaignId, playerId: player.id };
      return;
    }

    if (!meta) return;
    const room = rooms.get(meta.campaignId);
    room?.handleMessage(meta.playerId, msg);
  });

  ws.on("close", () => {
    if (!meta) return;
    const room = rooms.get(meta.campaignId);
    room?.leave(meta.playerId);
    if (room?.isEmpty()) {
      room.dispose();
      rooms.delete(meta.campaignId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Frontline: Critical Hour server listening on :${PORT}`);
});
