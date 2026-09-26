import type { Player, Role } from "@frontline/shared";

const ROLE_INFO: { role: Role; label: string; available: boolean; desc: string }[] = [
  { role: "ground", label: "GROUND COMMAND", available: true, desc: "Units, patrols, defense of key terrain." },
  { role: "logistics", label: "LOGISTICS COMMAND", available: true, desc: "Fuel, supplies, ammo, convoys." },
  { role: "air", label: "AIR COMMAND", available: false, desc: "Coming in a future update." },
  { role: "intel", label: "INTELLIGENCE & OPS", available: false, desc: "Coming in a future update." },
];

export default function Lobby({
  campaignId,
  seed,
  players,
  me,
  onChooseRole,
  onStart,
}: {
  campaignId: string;
  seed: string;
  players: Player[];
  me: Player | null;
  onChooseRole: (role: Role) => void;
  onStart: () => void;
}) {
  const roleOwner = (role: Role) => players.find((p) => p.role === role && p.connected);
  const canStart =
    !!roleOwner("ground") && !!roleOwner("logistics") && players.filter((p) => p.connected).length >= 2;

  return (
    <div className="screen lobby-screen">
      <div className="lobby-card">
        <h2>FRONTLINE</h2>
        <p className="campaign-code">CAMPAIGN: {campaignId || seed}</p>
        <div className="role-grid">
          {ROLE_INFO.map((r) => {
            const owner = roleOwner(r.role);
            const isMine = me?.role === r.role;
            return (
              <button
                key={r.role}
                className={`role-slot ${isMine ? "mine" : ""} ${!r.available ? "locked" : ""}`}
                disabled={!r.available || (!!owner && !isMine)}
                onClick={() => onChooseRole(r.role)}
              >
                <div className="role-title">{r.label}</div>
                <div className="role-desc">{r.desc}</div>
                <div className="role-status">
                  {!r.available ? "LOCKED" : owner ? owner.name + (isMine ? " (you)" : "") : "OPEN"}
                </div>
              </button>
            );
          })}
        </div>
        <p className="players-count">Players connected: {players.filter((p) => p.connected).length}/4</p>
        <button className="primary" disabled={!canStart} onClick={onStart}>
          START CAMPAIGN
        </button>
        {!canStart && <p className="hint">Need at least one Ground and one Logistics commander to begin.</p>}
        <button
          className="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(campaignId || seed).catch(() => {});
          }}
        >
          COPY CAMPAIGN CODE
        </button>
      </div>
    </div>
  );
}
