import type { Base, ContactStatus, Unit, UnitCategory, Vector2 } from "@frontline/shared";

const FRIENDLY_GROUND = "#3ad0e0";
const FRIENDLY_LOGISTICS = "#e0c43a";
const CONTACT_COLOR: Record<ContactStatus, string> = {
  suspected: "#8a8f98",
  probable: "#e0a63a",
  confirmed: "#e04a3a",
  lost: "#5a5f68",
};

export function unitColor(role: string): string {
  return role === "ground" ? FRIENDLY_GROUND : role === "logistics" ? FRIENDLY_LOGISTICS : "#9a9aa0";
}

/** Simplified NATO-style unit frame + type glyph, drawn at world-space `pos`. */
export function drawUnitIcon(
  ctx: CanvasRenderingContext2D,
  pos: Vector2,
  type: UnitCategory,
  color: string,
  opts: { selected: boolean; dim: boolean; size?: number }
) {
  const s = opts.size ?? 9;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.globalAlpha = opts.dim ? 0.55 : 1;

  // frame
  ctx.fillStyle = "rgba(6,10,15,0.85)";
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.selected ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.rect(-s, -s, s * 2, s * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  const g = s * 0.6;

  switch (type) {
    case "infantry":
      ctx.beginPath();
      ctx.moveTo(-g, -g);
      ctx.lineTo(g, g);
      ctx.moveTo(g, -g);
      ctx.lineTo(-g, g);
      ctx.stroke();
      break;
    case "armor":
      ctx.beginPath();
      ctx.ellipse(0, 0, g, g * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "recon":
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.rect(-g, -g, g * 2, g * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "transport":
      ctx.beginPath();
      ctx.moveTo(-g, g * 0.5);
      ctx.lineTo(0, -g);
      ctx.lineTo(g, g * 0.5);
      ctx.closePath();
      ctx.stroke();
      break;
    case "supply_truck":
      ctx.beginPath();
      ctx.rect(-g, -g * 0.6, g * 2, g * 1.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-g, 0);
      ctx.lineTo(g, 0);
      ctx.stroke();
      break;
    case "fuel_truck":
      ctx.beginPath();
      ctx.moveTo(0, -g);
      ctx.lineTo(g * 0.8, g * 0.4);
      ctx.quadraticCurveTo(0, g, -g * 0.8, g * 0.4);
      ctx.closePath();
      ctx.stroke();
      break;
  }

  if (opts.selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(-s - 4, -s - 4, s * 2 + 8, s * 2 + 8);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** NATO-style hostile diamond for a fog-of-war contact. */
export function drawContactIcon(ctx: CanvasRenderingContext2D, pos: Vector2, status: ContactStatus, size = 10) {
  const color = CONTACT_COLOR[status];
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = color;
  ctx.lineWidth = status === "confirmed" ? 2.2 : 1.6;
  if (status === "suspected" || status === "lost") ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.rect(-size / 1.6, -size / 1.6, size * 1.25, size * 1.25);
  if (status === "confirmed") {
    ctx.fillStyle = "rgba(224,74,58,0.25)";
    ctx.fill();
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Fortified base marker: frame + small flag + supply-level bar. */
export function drawBaseIcon(ctx: CanvasRenderingContext2D, base: Base) {
  const { x, y } = base.position;
  const s = 12;
  ctx.save();
  ctx.translate(x, y);

  const color = base.isIsolated ? "#e04a3a" : "#3a7ae0";
  ctx.fillStyle = "rgba(8,13,19,0.9)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-s, -s, s * 2, s * 2);
  ctx.fill();
  ctx.stroke();

  // fortification hatch along the base of the frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = -s; i < s; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, s);
    ctx.lineTo(i + 3, s + 4);
    ctx.stroke();
  }

  // flag
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0, -s - 12);
  ctx.strokeStyle = "#dfe7ef";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -s - 12);
  ctx.lineTo(8, -s - 9);
  ctx.lineTo(0, -s - 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();

  // label with legibility backdrop
  ctx.font = "600 11px ui-monospace, Consolas, monospace";
  const labelW = ctx.measureText(base.name).width;
  ctx.fillStyle = "rgba(5,8,12,0.7)";
  ctx.fillRect(x + s + 3, y - s - 15, labelW + 6, 14);
  ctx.fillStyle = "#dfe7ef";
  ctx.fillText(base.name, x + s + 6, y - s - 4);

  // fuel bar
  const pct = base.resources.fuel / Math.max(base.maxResources.fuel, 1);
  ctx.fillStyle = "#0c1219";
  ctx.fillRect(x - 16, y + s + 5, 32, 5);
  ctx.fillStyle = pct < 0.2 ? "#e04a3a" : pct < 0.5 ? "#e0a63a" : "#4ad07a";
  ctx.fillRect(x - 16, y + s + 5, 32 * Math.max(pct, 0), 5);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 16, y + s + 5, 32, 5);
}

export function drawScaleBar(ctx: CanvasRenderingContext2D, viewW: number, viewH: number) {
  const barW = 120; // world units, arbitrary in-fiction scale
  const x0 = viewW - barW - 24;
  const y0 = viewH - 22;
  ctx.strokeStyle = "rgba(223,231,239,0.6)";
  ctx.fillStyle = "rgba(223,231,239,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + barW, y0);
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x0, y0 + 4);
  ctx.moveTo(x0 + barW / 2, y0 - 3);
  ctx.lineTo(x0 + barW / 2, y0 + 3);
  ctx.moveTo(x0 + barW, y0 - 4);
  ctx.lineTo(x0 + barW, y0 + 4);
  ctx.stroke();
  ctx.font = "10px ui-monospace, Consolas, monospace";
  ctx.fillText("10 km", x0 + barW / 2 - 14, y0 + 16);
}
