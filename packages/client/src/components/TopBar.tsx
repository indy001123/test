import type { CampaignState } from "@frontline/shared";

function formatClock(elapsedSec: number): string {
  const m = Math.floor(elapsedSec / 60);
  const s = Math.floor(elapsedSec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TopBar({ state, myRole }: { state: CampaignState; myRole: string | null }) {
  const totalFuel = state.bases.reduce((s, b) => s + b.resources.fuel, 0);
  const totalSupplies = state.bases.reduce((s, b) => s + b.resources.supplies, 0);
  const totalAmmo = state.bases.reduce((s, b) => s + b.resources.ammo, 0);
  const criticalAlerts = state.events.filter((e) => e.severity === "critical" && state.tick - e.tick < 20).length;

  return (
    <div className="top-bar">
      <div className="top-bar-section">
        <span className="clock">{formatClock(state.elapsedSec)}</span>
        <span className="role-badge">{myRole?.toUpperCase()}</span>
      </div>
      <div className="top-bar-section">
        <span>FUEL {Math.round(totalFuel)}</span>
        <span>SUPPLIES {Math.round(totalSupplies)}</span>
        <span>AMMO {Math.round(totalAmmo)}</span>
      </div>
      <div className="top-bar-section">
        <span className="objective">
          OBJECTIVE: {Math.round(state.objective.progress)}/{state.objective.target}
        </span>
        {criticalAlerts > 0 && <span className="alert-critical">⚠ {criticalAlerts} CRITICAL</span>}
      </div>
    </div>
  );
}
