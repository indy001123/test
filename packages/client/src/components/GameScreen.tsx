import { useState } from "react";
import type { CampaignState, Order, OrderKind, Player, ResourcePool, Vector2 } from "@frontline/shared";
import TopBar from "./TopBar";
import StrategicMap from "./StrategicMap";
import CommandPanel from "./CommandPanel";
import EventFeed from "./EventFeed";

interface ChatMessage {
  playerId: string;
  name: string;
  text: string;
  tick: number;
}

export default function GameScreen({
  state,
  me,
  players,
  chat,
  onIssueOrder,
  onDispatchConvoy,
  onSendChat,
}: {
  state: CampaignState;
  me: Player;
  players: Player[];
  chat: ChatMessage[];
  onIssueOrder: (unitId: string, order: Omit<Order, "issuedAtTick">) => void;
  onDispatchConvoy: (fromBaseId: string, toBaseId: string, cargo: ResourcePool) => void;
  onSendChat: (text: string) => void;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<OrderKind | null>(null);
  const [chatInput, setChatInput] = useState("");

  function handleMapClick(pos: Vector2) {
    if (selectedUnitId && pendingOrder) {
      onIssueOrder(selectedUnitId, { kind: pendingOrder, targetPosition: pos });
      setPendingOrder(null);
    }
  }

  const showOverlay = state.phase === "complete" || state.phase === "failed";

  return (
    <div className="game-screen">
      <TopBar state={state} myRole={me.role} />
      <div className="game-body">
        <CommandPanel
          state={state}
          myRole={me.role}
          selectedUnitId={selectedUnitId}
          pendingOrder={pendingOrder}
          onSelectUnit={(id) => {
            setSelectedUnitId(id);
            setPendingOrder(null);
          }}
          onBeginOrder={(kind) => setPendingOrder(kind)}
          onIssueOrder={onIssueOrder}
          onDispatchConvoy={onDispatchConvoy}
        />
        <div className="map-container">
          <StrategicMap
            state={state}
            myRole={me.role}
            selectedUnitId={selectedUnitId}
            pendingOrder={pendingOrder}
            onSelectUnit={setSelectedUnitId}
            onMapClick={handleMapClick}
          />
        </div>
        <div className="chat-panel">
          <div className="chat-log">
            {chat.map((m, i) => (
              <div key={i} className="chat-message">
                <strong>{m.name}:</strong> {m.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chatInput.trim()) {
                onSendChat(chatInput.trim());
                setChatInput("");
              }
            }}
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Message team..."
              maxLength={200}
            />
          </form>
          <div className="roster">
            {players.map((p) => (
              <div key={p.id} className={`roster-row ${p.connected ? "" : "disconnected"}`}>
                {p.name} — {p.role ?? "unassigned"} {!p.connected && "(offline)"}
              </div>
            ))}
          </div>
        </div>
      </div>
      <EventFeed events={state.events} />

      {showOverlay && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{state.phase === "complete" ? "OBJECTIVE COMPLETE" : "CAMPAIGN FAILED"}</h2>
            <p>{state.objective.description}</p>
            <p>
              Progress: {Math.round(state.objective.progress)}/{state.objective.target}
            </p>
            <p>Duration: {Math.floor(state.elapsedSec / 60)}m {Math.floor(state.elapsedSec % 60)}s</p>
            <p>Total events: {state.events.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
