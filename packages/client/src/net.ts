import type { ClientMessage, ServerMessage } from "@frontline/shared";

export type ServerMessageHandler = (msg: ServerMessage) => void;

/**
 * Thin WebSocket wrapper with auto-reconnect. On reconnect it re-sends the
 * last join payload (campaignId/name/playerId) so a dropped player can
 * resume their role without the campaign pausing (spec section 40).
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private lastJoin: Extract<ClientMessage, { type: "join" }> | null = null;
  private handlers = new Set<ServerMessageHandler>();
  private reconnectAttempt = 0;
  private closedByUser = false;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  onMessage(handler: ServerMessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  join(campaignId: string, name: string, playerId?: string) {
    this.lastJoin = { type: "join", campaignId, name, playerId };
    this.closedByUser = false;
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
      if (this.lastJoin) ws.send(JSON.stringify(this.lastJoin));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === "joined") {
          this.lastJoin = this.lastJoin ? { ...this.lastJoin, playerId: msg.playerId } : null;
        }
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.closedByUser || !this.lastJoin) return;
      const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 8000);
      this.reconnectAttempt += 1;
      setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

export function defaultWsUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:8080/ws`;
}
