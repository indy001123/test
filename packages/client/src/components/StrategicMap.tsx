import { useEffect, useRef } from "react";
import type { CampaignState, Vector2 } from "@frontline/shared";
import { TICKS_PER_SEC } from "@frontline/shared";
import { buildTerrainLayer, VIEW_W, VIEW_H } from "../map/terrain";
import { drawBaseIcon, drawContactIcon, drawScaleBar, drawUnitIcon, unitColor } from "../map/icons";

const TICK_MS = 1000 / TICKS_PER_SEC;

interface Snapshot {
  timestamp: number;
  units: Map<string, Vector2>;
  convoys: Map<string, Vector2>;
  contacts: Map<string, Vector2>;
}

function snapshotFrom(state: CampaignState, timestamp: number): Snapshot {
  return {
    timestamp,
    units: new Map(state.units.map((u) => [u.id, u.position])),
    convoys: new Map(state.convoys.map((c) => [c.id, c.position])),
    contacts: new Map(state.contacts.map((c) => [c.id, c.position])),
  };
}

function lerpPos(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function interpolated(id: string, current: Vector2, prev: Snapshot | null, cur: Snapshot | null, map: "units" | "convoys" | "contacts", t: number): Vector2 {
  const from = prev?.[map].get(id);
  if (!from || !cur) return current;
  return lerpPos(from, current, t);
}

export default function StrategicMap({
  state,
  myRole,
  selectedUnitId,
  pendingOrder,
  onSelectUnit,
  onMapClick,
}: {
  state: CampaignState;
  myRole: string | null;
  selectedUnitId: string | null;
  pendingOrder: string | null;
  onSelectUnit: (id: string | null) => void;
  onMapClick: (pos: Vector2) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const prevSnapRef = useRef<Snapshot | null>(null);
  const curSnapRef = useRef<Snapshot | null>(null);
  const stateRef = useRef(state);
  const selectionRef = useRef(selectedUnitId);
  const pendingRef = useRef(pendingOrder);
  const roleRef = useRef(myRole);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    selectionRef.current = selectedUnitId;
  }, [selectedUnitId]);
  useEffect(() => {
    pendingRef.current = pendingOrder;
  }, [pendingOrder]);
  useEffect(() => {
    roleRef.current = myRole;
  }, [myRole]);

  // Regions/bases are fixed for the life of a campaign, so the expensive
  // textured terrain only needs to be rendered once and then blitted.
  useEffect(() => {
    terrainRef.current = buildTerrainLayer(state.regions, state.bases);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.campaignId]);

  // Keep a "previous tick" and "current tick" snapshot so positions can be
  // smoothly interpolated between the server's 2Hz updates instead of
  // visibly stepping.
  useEffect(() => {
    const now = performance.now();
    prevSnapRef.current = curSnapRef.current ?? snapshotFrom(state, now);
    curSnapRef.current = snapshotFrom(state, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function draw() {
      const s = stateRef.current;
      const terrain = terrainRef.current;
      const prevSnap = prevSnapRef.current;
      const curSnap = curSnapRef.current;
      const now = performance.now();
      const t = curSnap ? Math.min(1, (now - curSnap.timestamp) / TICK_MS) : 1;
      const myRoleNow = roleRef.current;
      const selected = selectionRef.current;
      const targeting = !!pendingRef.current;

      ctx!.clearRect(0, 0, VIEW_W, VIEW_H);
      if (terrain) ctx!.drawImage(terrain, 0, 0);

      // convoy route lines + moving marker
      for (const convoy of s.convoys) {
        const from = s.bases.find((b) => b.id === convoy.fromBaseId);
        const to = s.bases.find((b) => b.id === convoy.toBaseId);
        if (from && to) {
          ctx!.beginPath();
          ctx!.moveTo(from.position.x, from.position.y);
          ctx!.lineTo(to.position.x, to.position.y);
          ctx!.strokeStyle = "rgba(224,196,58,0.35)";
          ctx!.setLineDash([4, 4]);
          ctx!.lineWidth = 1;
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
        const pos = interpolated(convoy.id, convoy.position, prevSnap, curSnap, "convoys", t);
        ctx!.beginPath();
        ctx!.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx!.fillStyle = convoy.status === "delayed" ? "#e0a63a" : "#e0c43a";
        ctx!.shadowColor = convoy.status === "delayed" ? "#e0a63a" : "#e0c43a";
        ctx!.shadowBlur = 6;
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }

      // bases
      for (const base of s.bases) drawBaseIcon(ctx!, base);

      // enemy contacts (fog of war)
      for (const contact of s.contacts) {
        if (contact.status === "lost" && s.tick - contact.lastSeenTick > 40) continue;
        const pos = interpolated(contact.id, contact.position, prevSnap, curSnap, "contacts", t);
        drawContactIcon(ctx!, pos, contact.status);
        ctx!.font = "10px ui-monospace, Consolas, monospace";
        const label = `${contact.status.toUpperCase()} ${Math.round(contact.confidence)}%`;
        const w = ctx!.measureText(label).width;
        ctx!.fillStyle = "rgba(5,8,12,0.6)";
        ctx!.fillRect(pos.x + 12, pos.y - 4, w + 6, 13);
        ctx!.fillStyle = "#c9cfd6";
        ctx!.fillText(label, pos.x + 15, pos.y + 5);
      }

      // units
      for (const unit of s.units) {
        const isMine = unit.role === myRoleNow;
        const isSelected = unit.id === selected;
        const pos = interpolated(unit.id, unit.position, prevSnap, curSnap, "units", t);
        drawUnitIcon(ctx!, pos, unit.type, unitColor(unit.role), { selected: isSelected, dim: !isMine });
        if (unit.readiness < 60) {
          ctx!.fillStyle = "#e0a63a";
          ctx!.font = "bold 11px ui-monospace, Consolas, monospace";
          ctx!.fillText("!", pos.x + 10, pos.y - 9);
        }
      }

      drawScaleBar(ctx!, VIEW_W, VIEW_H);

      if (targeting) {
        ctx!.fillStyle = "rgba(58,208,224,0.05)";
        ctx!.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function toWorld(e: React.MouseEvent<HTMLCanvasElement>): Vector2 {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = toWorld(e);
    const clickedUnit = state.units.find((u) => Math.hypot(u.position.x - pos.x, u.position.y - pos.y) < 14);
    if (clickedUnit && clickedUnit.role === myRole && !pendingOrder) {
      onSelectUnit(clickedUnit.id);
      return;
    }
    if (pendingOrder && selectedUnitId) {
      onMapClick(pos);
      return;
    }
    if (!clickedUnit) onSelectUnit(null);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`strategic-map ${pendingOrder ? "targeting" : ""}`}
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
    />
  );
}
