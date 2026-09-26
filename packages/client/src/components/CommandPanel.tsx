import { useState } from "react";
import type { CampaignState, Order, OrderKind, ResourcePool, Unit } from "@frontline/shared";
import { UNIT_DEFS } from "@frontline/shared";

const GROUND_ORDERS: OrderKind[] = ["MOVE", "PATROL", "DEFEND", "RECON", "WITHDRAW"];
const LOGISTICS_ORDERS: OrderKind[] = ["MOVE", "WITHDRAW"];

export default function CommandPanel({
  state,
  myRole,
  selectedUnitId,
  pendingOrder,
  onSelectUnit,
  onBeginOrder,
  onIssueOrder,
  onDispatchConvoy,
}: {
  state: CampaignState;
  myRole: string | null;
  selectedUnitId: string | null;
  pendingOrder: OrderKind | null;
  onSelectUnit: (id: string | null) => void;
  onBeginOrder: (kind: OrderKind) => void;
  onIssueOrder: (unitId: string, order: Omit<Order, "issuedAtTick">) => void;
  onDispatchConvoy: (fromBaseId: string, toBaseId: string, cargo: ResourcePool) => void;
}) {
  const myUnits = state.units.filter((u) => u.role === myRole);
  const selectedUnit = state.units.find((u) => u.id === selectedUnitId) ?? null;
  const orderKinds = myRole === "logistics" ? LOGISTICS_ORDERS : GROUND_ORDERS;

  return (
    <div className="command-panel">
      <h3>{myRole === "logistics" ? "LOGISTICS COMMAND" : "GROUND COMMAND"}</h3>

      <div className="unit-list">
        {myUnits.map((u) => (
          <UnitRow key={u.id} unit={u} selected={u.id === selectedUnitId} onSelect={() => onSelectUnit(u.id)} />
        ))}
      </div>

      {selectedUnit && (
        <div className="order-box">
          <div className="order-box-title">{UNIT_DEFS[selectedUnit.type].label}</div>
          <div className="order-buttons">
            {orderKinds.map((kind) => (
              <button
                key={kind}
                className={pendingOrder === kind ? "active" : ""}
                onClick={() => {
                  if (kind === "WITHDRAW") {
                    const home = state.bases.find((b) => b.id === selectedUnit.homeBaseId);
                    if (home) onIssueOrder(selectedUnit.id, { kind: "WITHDRAW", targetPosition: home.position });
                  } else {
                    onBeginOrder(kind);
                  }
                }}
              >
                {kind}
              </button>
            ))}
          </div>
          {pendingOrder && pendingOrder !== "WITHDRAW" && <p className="hint">Click the map to set a target for {pendingOrder}.</p>}
        </div>
      )}

      {myRole === "logistics" && <ConvoyPanel state={state} onDispatchConvoy={onDispatchConvoy} />}
    </div>
  );
}

function UnitRow({ unit, selected, onSelect }: { unit: Unit; selected: boolean; onSelect: () => void }) {
  const def = UNIT_DEFS[unit.type];
  return (
    <button className={`unit-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <span className="unit-label">{def.label}</span>
      <span className="unit-status">{unit.status}</span>
      <div className="bar">
        <div className="bar-fill fuel" style={{ width: `${(unit.fuel / unit.maxFuel) * 100}%` }} />
      </div>
      {unit.readiness < 60 && <span className="warn">READINESS {Math.round(unit.readiness)}%</span>}
    </button>
  );
}

function ConvoyPanel({
  state,
  onDispatchConvoy,
}: {
  state: CampaignState;
  onDispatchConvoy: (fromBaseId: string, toBaseId: string, cargo: ResourcePool) => void;
}) {
  const [fromBaseId, setFromBaseId] = useState(state.bases[0]?.id ?? "");
  const [toBaseId, setToBaseId] = useState(state.bases[1]?.id ?? "");
  const [fuel, setFuel] = useState(100);
  const [supplies, setSupplies] = useState(80);
  const [ammo, setAmmo] = useState(0);

  const fromBase = state.bases.find((b) => b.id === fromBaseId);

  return (
    <div className="convoy-panel">
      <h4>DISPATCH CONVOY</h4>
      <label>
        From
        <select value={fromBaseId} onChange={(e) => setFromBaseId(e.target.value)}>
          {state.bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        To
        <select value={toBaseId} onChange={(e) => setToBaseId(e.target.value)}>
          {state.bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fuel <input type="number" min={0} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} />
      </label>
      <label>
        Supplies <input type="number" min={0} value={supplies} onChange={(e) => setSupplies(Number(e.target.value))} />
      </label>
      <label>
        Ammo <input type="number" min={0} value={ammo} onChange={(e) => setAmmo(Number(e.target.value))} />
      </label>
      {fromBase && (
        <p className="hint">
          {fromBase.name} has {Math.round(fromBase.resources.fuel)} fuel / {Math.round(fromBase.resources.supplies)} supplies /{" "}
          {Math.round(fromBase.resources.ammo)} ammo.
        </p>
      )}
      <button
        className="primary"
        disabled={fromBaseId === toBaseId}
        onClick={() => onDispatchConvoy(fromBaseId, toBaseId, { fuel, supplies, ammo })}
      >
        DISPATCH
      </button>
      <div className="convoy-list">
        {state.convoys.map((c) => {
          const to = state.bases.find((b) => b.id === c.toBaseId);
          return (
            <div key={c.id} className={`convoy-item ${c.status}`}>
              To {to?.name ?? "?"} — {Math.round(c.progress * 100)}% ({c.status})
            </div>
          );
        })}
      </div>
    </div>
  );
}
