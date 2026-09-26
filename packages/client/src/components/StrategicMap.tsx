import { useEffect, useRef } from "react";
import type { CampaignState, Vector2 } from "@frontline/shared";

const VIEW_W = 1000;
const VIEW_H = 600;

const CONTACT_COLOR: Record<string, string> = {
  suspected: "#8a8f98",
  probable: "#e0a63a",
  confirmed: "#e04a3a",
  lost: "#5a5f68",
};

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#0a0f16";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (const region of state.regions) {
      ctx.beginPath();
      region.path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = region.control === "enemy" ? "rgba(120,40,40,0.25)" : "rgba(40,80,120,0.15)";
      ctx.fill();
      ctx.strokeStyle = region.control === "enemy" ? "#7a3030" : "#2e4a63";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#5c7185";
      ctx.font = "11px monospace";
      ctx.fillText(region.name.toUpperCase(), region.path[0].x + 10, region.path[0].y + 18);
    }

    // convoys (draw route line + moving marker)
    for (const convoy of state.convoys) {
      const from = state.bases.find((b) => b.id === convoy.fromBaseId);
      const to = state.bases.find((b) => b.id === convoy.toBaseId);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.position.x, from.position.y);
        ctx.lineTo(to.position.x, to.position.y);
        ctx.strokeStyle = "rgba(224,196,58,0.35)";
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(convoy.position.x, convoy.position.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = convoy.status === "delayed" ? "#e0a63a" : "#e0c43a";
      ctx.fill();
    }

    // bases
    for (const base of state.bases) {
      ctx.fillStyle = base.isIsolated ? "#e04a3a" : "#3a7ae0";
      ctx.fillRect(base.position.x - 8, base.position.y - 8, 16, 16);
      ctx.strokeStyle = "#dfe7ef";
      ctx.strokeRect(base.position.x - 8, base.position.y - 8, 16, 16);
      ctx.fillStyle = "#dfe7ef";
      ctx.font = "11px monospace";
      ctx.fillText(base.name, base.position.x + 12, base.position.y - 6);
      const pct = base.resources.fuel / Math.max(base.maxResources.fuel, 1);
      ctx.fillStyle = "#161c24";
      ctx.fillRect(base.position.x - 15, base.position.y + 12, 30, 4);
      ctx.fillStyle = pct < 0.2 ? "#e04a3a" : pct < 0.5 ? "#e0a63a" : "#4ad07a";
      ctx.fillRect(base.position.x - 15, base.position.y + 12, 30 * Math.max(pct, 0), 4);
    }

    // enemy contacts (fog of war)
    for (const contact of state.contacts) {
      if (contact.status === "lost" && state.tick - contact.lastSeenTick > 40) continue;
      ctx.beginPath();
      ctx.arc(contact.position.x, contact.position.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = CONTACT_COLOR[contact.status] ?? "#8a8f98";
      ctx.lineWidth = contact.status === "lost" ? 1 : 2;
      if (contact.status === "lost" || contact.status === "suspected") ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CONTACT_COLOR[contact.status] ?? "#8a8f98";
      ctx.font = "10px monospace";
      ctx.fillText(`${contact.status.toUpperCase()} ${Math.round(contact.confidence)}%`, contact.position.x + 12, contact.position.y + 4);
    }

    // units
    for (const unit of state.units) {
      const isMine = unit.role === myRole;
      const isSelected = unit.id === selectedUnitId;
      ctx.beginPath();
      ctx.arc(unit.position.x, unit.position.y, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = unit.role === "ground" ? "#3ad0e0" : unit.role === "logistics" ? "#e0c43a" : "#9a9aa0";
      ctx.globalAlpha = isMine ? 1 : 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (unit.readiness < 60) {
        ctx.fillStyle = "#e0a63a";
        ctx.font = "9px monospace";
        ctx.fillText("!", unit.position.x + 7, unit.position.y - 7);
      }
    }
  }, [state, myRole, selectedUnitId]);

  function toWorld(e: React.MouseEvent<HTMLCanvasElement>): Vector2 {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = toWorld(e);
    const clickedUnit = state.units.find((u) => Math.hypot(u.position.x - pos.x, u.position.y - pos.y) < 12);
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
