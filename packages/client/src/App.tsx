import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignState, Player, PlayerId, Role, ServerMessage } from "@frontline/shared";
import { GameSocket, defaultWsUrl } from "./net";
import Home from "./components/Home";
import Lobby from "./components/Lobby";
import GameScreen from "./components/GameScreen";

interface ChatMessage {
  playerId: PlayerId;
  name: string;
  text: string;
  tick: number;
}

function randomCampaignCode(): string {
  const n = Math.floor(100000 + Math.random() * 899999);
  return `KARSIA-${n}`;
}

export default function App() {
  const [view, setView] = useState<"home" | "lobby" | "game">("home");
  const [campaignId, setCampaignId] = useState("");
  const [seed, setSeed] = useState("");
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [state, setState] = useState<CampaignState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    const socket = new GameSocket(defaultWsUrl());
    socketRef.current = socket;
    const off = socket.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "joined":
          setPlayerId(msg.playerId);
          localStorage.setItem(`frontline:${msg.campaignId}:playerId`, msg.playerId);
          break;
        case "lobbyState":
          setPlayers(msg.players);
          setSeed(msg.seed);
          setView((v) => (v === "game" ? v : "lobby"));
          break;
        case "stateUpdate":
          setState(msg.state);
          setView("game");
          break;
        case "chat":
          setChat((c) => [...c.slice(-49), msg]);
          break;
        case "error":
          setError(msg.message);
          setTimeout(() => setError((e) => (e === msg.message ? null : e)), 4000);
          break;
      }
    });
    return () => {
      off();
      socket.close();
    };
  }, []);

  const joinCampaign = useCallback((code: string, name: string) => {
    const id = code.trim() || randomCampaignCode();
    setCampaignId(id);
    const savedPlayerId = localStorage.getItem(`frontline:${id}:playerId`) ?? undefined;
    socketRef.current?.join(id, name, savedPlayerId);
  }, []);

  const chooseRole = useCallback((role: Role) => {
    socketRef.current?.send({ type: "chooseRole", role });
  }, []);

  const startCampaign = useCallback(() => {
    socketRef.current?.send({ type: "startCampaign" });
  }, []);

  const sendChat = useCallback((text: string) => {
    socketRef.current?.send({ type: "chat", text });
  }, []);

  const me = useMemo(() => players.find((p) => p.id === playerId) ?? null, [players, playerId]);

  return (
    <div className="app-root">
      {error && <div className="toast toast-error">{error}</div>}
      {view === "home" && <Home onJoin={joinCampaign} />}
      {view === "lobby" && (
        <Lobby
          campaignId={campaignId}
          seed={seed}
          players={players}
          me={me}
          onChooseRole={chooseRole}
          onStart={startCampaign}
        />
      )}
      {view === "game" && state && me && (
        <GameScreen
          state={state}
          me={me}
          players={players}
          chat={chat}
          onIssueOrder={(unitId, order) => socketRef.current?.send({ type: "issueOrder", unitId, order })}
          onDispatchConvoy={(fromBaseId, toBaseId, cargo) =>
            socketRef.current?.send({ type: "dispatchConvoy", fromBaseId, toBaseId, cargo })
          }
          onSendChat={sendChat}
        />
      )}
    </div>
  );
}
