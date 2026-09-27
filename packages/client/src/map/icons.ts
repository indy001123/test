import type { Base, ContactStatus, UnitCategory, Vector2 } from "@frontline/shared";
import { drawGroundShadow } from "./effects";

const FRIENDLY_GROUND = "#4fd8e8";
const FRIENDLY_LOGISTICS = "#e8cc4a";
const CONTACT_COLOR: Record<ContactStatus, string> = {
  suspected: "#9a9fa8",
  probable: "#e0a63a",
  confirmed: "#e0453a",
  lost: "#5a5f68",
};

export function unitColor(role: string): string {
  return role === "ground" ? FRIENDLY_GROUND : role === "logistics" ? FRIENDLY_LOGISTICS : "#9a9aa0";
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amount));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amount));
  const b = Math.max(0, (n & 255) * (1 - amount));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Top-down vehicle/unit silhouettes (recognizable shapes, not abstract symbology). */
export function drawUnitIcon(
  ctx: CanvasRenderingContext2D,
  pos: Vector2,
  type: UnitCategory,
  color: string,
  opts: { selected: boolean; dim: boolean }
) {
  drawGroundShadow(ctx, pos, 8, 3);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.globalAlpha = opts.dim ? 0.55 : 1;
  ctx.fillStyle = color;
  ctx.strokeStyle = darken(color, 0.55);
  ctx.lineWidth = 1;

  switch (type) {
    case "infantry": {
      // fireteam: a loose cluster of three soldiers seen from above
      const dots: Vector2[] = [
        { x: -4, y: 3 },
        { x: 3, y: 5 },
        { x: 0, y: -4 },
      ];
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case "recon": {
      // light jeep: rectangular body + four wheel marks
      ctx.beginPath();
      ctx.roundRect(-7, -4, 14, 8, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = darken(color, 0.6);
      for (const [wx, wy] of [
        [-6, -5],
        [6, -5],
        [-6, 5],
        [6, 5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(wx, wy, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "armor": {
      // tank: hull + turret + gun barrel pointing "forward"
      ctx.beginPath();
      ctx.roundRect(-8, -5, 16, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = darken(color, 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = darken(color, 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      break;
    }
    case "transport": {
      // truck: cab + cargo bed
      ctx.beginPath();
      ctx.rect(-9, -5, 6, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = darken(color, 0.35);
      ctx.beginPath();
      ctx.rect(-3, -6, 11, 12);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "supply_truck": {
      // truck with a crated cargo bed (grid pattern)
      ctx.beginPath();
      ctx.rect(-9, -5, 6, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-3, -6, 12, 12);
      ctx.fillStyle = darken(color, 0.35);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = darken(color, 0.6);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(1, -6);
      ctx.lineTo(1, 6);
      ctx.moveTo(5, -6);
      ctx.lineTo(5, 6);
      ctx.stroke();
      break;
    }
    case "fuel_truck": {
      // truck with a cylindrical tank on the bed
      ctx.beginPath();
      ctx.rect(-9, -5, 6, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(3, 0, 6, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = darken(color, 0.25);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  if (opts.selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Fog-of-war hostile marker: uncertainty reads through opacity/dash, not a hard NATO frame. */
export function drawContactIcon(ctx: CanvasRenderingContext2D, pos: Vector2, status: ContactStatus, size = 9) {
  const color = CONTACT_COLOR[status];
  const certainty = status === "confirmed" ? 1 : status === "probable" ? 0.75 : status === "suspected" ? 0.45 : 0.3;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.globalAlpha = certainty;

  ctx.strokeStyle = color;
  ctx.lineWidth = status === "confirmed" ? 2 : 1.4;
  if (status !== "confirmed") ctx.setLineDash([2.5, 2.5]);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // a small armed-figure silhouette inside once confidence is meaningful
  if (certainty > 0.4) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-2, 1, 1.6, 0, Math.PI * 2);
    ctx.arc(2, -1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Walled compound: perimeter, corner watchtowers, gate, a few buildings, helipad. */
export function drawBaseIcon(ctx: CanvasRenderingContext2D, base: Base) {
  const { x, y } = base.position;
  const half = 30;
  const color = base.isIsolated ? "#e0453a" : "#4a86e0";

  drawGroundShadow(ctx, base.position, half + 8, half * 0.4);

  ctx.save();
  ctx.translate(x, y);

  // ground pad
  ctx.fillStyle = "rgba(90,78,58,0.45)";
  ctx.fillRect(-half - 4, -half - 4, half * 2 + 8, half * 2 + 8);

  // perimeter wall
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(-half, -half, half * 2, half * 2);
  // gate gap on the south wall
  ctx.strokeStyle = "#0a0d12";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, half);
  ctx.lineTo(6, half);
  ctx.stroke();

  // corner watchtowers
  ctx.fillStyle = "rgba(8,13,19,0.9)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  for (const [cx, cy] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // a few flat-roofed buildings inside the compound
  const buildings: [number, number, number, number][] = [
    [-18, -14, 16, 12],
    [2, -18, 20, 10],
    [-16, 6, 14, 14],
  ];
  ctx.fillStyle = "#8a7a58";
  ctx.strokeStyle = "#4a4030";
  ctx.lineWidth = 1;
  for (const [bx, by, bw, bh] of buildings) {
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
  }

  // helipad
  ctx.beginPath();
  ctx.arc(16, 14, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(220,220,220,0.5)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font = "700 9px ui-monospace, Consolas, monospace";
  ctx.fillStyle = "rgba(220,220,220,0.6)";
  ctx.fillText("H", 13, 17);

  ctx.restore();

  // label with legibility backdrop
  ctx.font = "600 11px ui-monospace, Consolas, monospace";
  const labelW = ctx.measureText(base.name).width;
  ctx.fillStyle = "rgba(5,8,12,0.75)";
  ctx.fillRect(x + half + 5, y - half - 15, labelW + 6, 14);
  ctx.fillStyle = "#dfe7ef";
  ctx.fillText(base.name, x + half + 8, y - half - 4);

  // fuel bar
  const pct = base.resources.fuel / Math.max(base.maxResources.fuel, 1);
  ctx.fillStyle = "#0c1219";
  ctx.fillRect(x - 18, y + half + 8, 36, 5);
  ctx.fillStyle = pct < 0.2 ? "#e0453a" : pct < 0.5 ? "#e0a63a" : "#4ad07a";
  ctx.fillRect(x - 18, y + half + 8, 36 * Math.max(pct, 0), 5);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 18, y + half + 8, 36, 5);
}

export function drawScaleBar(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, worldUnitsPerBar: number) {
  const barW = 120; // screen px
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
  const km = Math.round(worldUnitsPerBar / 10);
  ctx.fillText(`${km} km`, x0 + barW / 2 - 12, y0 + 16);
}
