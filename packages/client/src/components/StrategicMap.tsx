import { useEffect, useRef, useState } from "react";
import type { CampaignState, Vector2 } from "@frontline/shared";
import { TICKS_PER_SEC } from "@frontline/shared";
import { ACTION_CENTER, ACTION_H, ACTION_W, WORLD_MAX, WORLD_MIN, buildTerrainLayer, type TerrainLayer } from "../map/terrain";
import { drawBaseIcon, drawContactIcon, drawConvoyIcon, drawScaleBar, drawUnitIcon, unitColor } from "../map/icons";
import { drawCloudShadows, drawCompassRose, drawSmokeWisp } from "../map/effects";

const CLOUD_SHADOWS = [
  { x: ACTION_CENTER.x - 400, y: ACTION_CENTER.y - 300, r: 220, speed: 0.004 },
  { x: ACTION_CENTER.x + 300, y: ACTION_CENTER.y + 150, r: 160, speed: 0.006 },
  { x: ACTION_CENTER.x - 100, y: ACTION_CENTER.y + 400, r: 260, speed: 0.003 },
];

const TICK_MS = 1000 / TICKS_PER_SEC;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3.5;
const DRAG_THRESHOLD = 5; // screen px before a pointer-down counts as a pan, not a click

interface Snapshot {
  timestamp: number;
  units: Map<string, Vector2>;
  convoys: Map<string, Vector2>;
  contacts: Map<string, Vector2>;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
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

function clampCamera(cam: Camera): Camera {
  const margin = 400;
  return {
    x: Math.min(Math.max(cam.x, WORLD_MIN.x - margin), WORLD_MAX.x + margin),
    y: Math.min(Math.max(cam.y, WORLD_MIN.y - margin), WORLD_MAX.y + margin),
    zoom: Math.min(Math.max(cam.zoom, MIN_ZOOM), MAX_ZOOM),
  };
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
  const terrainRef = useRef<TerrainLayer | null>(null);
  const prevSnapRef = useRef<Snapshot | null>(null);
  const curSnapRef = useRef<Snapshot | null>(null);
  const stateRef = useRef(state);
  const selectionRef = useRef(selectedUnitId);
  const pendingRef = useRef(pendingOrder);
  const roleRef = useRef(myRole);
  const rafRef = useRef<number | undefined>(undefined);
  const cameraRef = useRef<Camera | null>(null);
  const [, forceRender] = useState(0); // only used so the RECENTER button re-mounts cleanly

  const dragRef = useRef<{ pointerId: number; startScreen: Vector2; startCamera: Camera; dragDistance: number } | null>(null);

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

  function recenter() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.min(rect.width / (ACTION_W + 320), rect.height / (ACTION_H + 320));
    cameraRef.current = clampCamera({ x: ACTION_CENTER.x, y: ACTION_CENTER.y, zoom: zoom || 0.6 });
    forceRender((n) => n + 1);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let lastCssW = 0;
    let lastCssH = 0;

    function draw() {
      const s = stateRef.current;
      const rect = canvas!.getBoundingClientRect();
      const cssW = rect.width || 1;
      const cssH = rect.height || 1;
      if (cssW !== lastCssW || cssH !== lastCssH) {
        canvas!.width = Math.round(cssW * dpr);
        canvas!.height = Math.round(cssH * dpr);
        lastCssW = cssW;
        lastCssH = cssH;
        if (!cameraRef.current) recenter();
      }
      if (!cameraRef.current) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const cam = cameraRef.current;

      const terrain = terrainRef.current;
      const prevSnap = prevSnapRef.current;
      const curSnap = curSnapRef.current;
      const now = performance.now();
      const t = curSnap ? Math.min(1, (now - curSnap.timestamp) / TICK_MS) : 1;
      const myRoleNow = roleRef.current;
      const selected = selectionRef.current;
      const targeting = !!pendingRef.current;

      // clear in screen space
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, cssW, cssH);

      // world-space transform (pan + zoom)
      ctx!.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cssW / 2 - cam.x * cam.zoom), dpr * (cssH / 2 - cam.y * cam.zoom));

      if (terrain) {
        ctx!.drawImage(terrain.canvas, WORLD_MIN.x, WORLD_MIN.y, WORLD_MAX.x - WORLD_MIN.x, WORLD_MAX.y - WORLD_MIN.y);
        drawCloudShadows(ctx!, CLOUD_SHADOWS, now);
        for (let i = 0; i < terrain.smokeSources.length; i++) {
          drawSmokeWisp(ctx!, terrain.smokeSources[i], now, i);
        }
      }

      // convoy route lines + moving truck marker (oriented toward destination)
      for (const convoy of s.convoys) {
        const from = s.bases.find((b) => b.id === convoy.fromBaseId);
        const to = s.bases.find((b) => b.id === convoy.toBaseId);
        if (from && to) {
          ctx!.beginPath();
          ctx!.moveTo(from.position.x, from.position.y);
          ctx!.lineTo(to.position.x, to.position.y);
          ctx!.strokeStyle = "rgba(224,196,58,0.4)";
          ctx!.setLineDash([4, 4]);
          ctx!.lineWidth = 1;
          ctx!.stroke();
          ctx!.setLineDash([]);
        }
        const pos = interpolated(convoy.id, convoy.position, prevSnap, curSnap, "convoys", t);
        const heading = from && to ? Math.atan2(to.position.y - from.position.y, to.position.x - from.position.x) : 0;
        drawConvoyIcon(ctx!, pos, heading, convoy.status === "delayed");
      }

      for (const base of s.bases) drawBaseIcon(ctx!, base);

      for (const contact of s.contacts) {
        if (contact.status === "lost" && s.tick - contact.lastSeenTick > 40) continue;
        const pos = interpolated(contact.id, contact.position, prevSnap, curSnap, "contacts", t);
        drawContactIcon(ctx!, pos, contact.status, now);
        ctx!.font = "10px ui-monospace, Consolas, monospace";
        const label = `${contact.status.toUpperCase()} ${Math.round(contact.confidence)}%`;
        const w = ctx!.measureText(label).width;
        ctx!.fillStyle = "rgba(5,8,12,0.6)";
        ctx!.fillRect(pos.x + 12, pos.y - 4, w + 6, 13);
        ctx!.fillStyle = "#c9cfd6";
        ctx!.fillText(label, pos.x + 15, pos.y + 5);
      }

      for (const unit of s.units) {
        const isMine = unit.role === myRoleNow;
        const isSelected = unit.id === selected;
        const pos = interpolated(unit.id, unit.position, prevSnap, curSnap, "units", t);
        drawUnitIcon(ctx!, pos, unit.type, unitColor(unit.role), { selected: isSelected, dim: !isMine, timeMs: now });
        if (unit.readiness < 60) {
          ctx!.fillStyle = "#e0a63a";
          ctx!.font = "bold 11px ui-monospace, Consolas, monospace";
          ctx!.fillText("!", pos.x + 10, pos.y - 9);
        }
      }

      // screen-space overlays (scale bar, targeting tint) — must not scale with zoom
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // cinematic dawn color grade: warm light from the upper-left, cooling
      // toward the lower-right — cheap, but does a lot for mood/atmosphere
      const light = ctx!.createLinearGradient(0, 0, cssW, cssH);
      light.addColorStop(0, "rgba(255,190,120,0.16)");
      light.addColorStop(0.45, "rgba(255,255,255,0)");
      light.addColorStop(1, "rgba(60,90,140,0.14)");
      ctx!.globalCompositeOperation = "overlay";
      ctx!.fillStyle = light;
      ctx!.fillRect(0, 0, cssW, cssH);
      ctx!.globalCompositeOperation = "source-over";

      drawScaleBar(ctx!, cssW, cssH, 120 / cam.zoom);
      drawCompassRose(ctx!, 34, 34);
      if (targeting) {
        ctx!.fillStyle = "rgba(58,208,224,0.05)";
        ctx!.fillRect(0, 0, cssW, cssH);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function screenToWorld(clientX: number, clientY: number): Vector2 {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current ?? { x: ACTION_CENTER.x, y: ACTION_CENTER.y, zoom: 0.6 };
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { x: cam.x + (sx - rect.width / 2) / cam.zoom, y: cam.y + (sy - rect.height / 2) / cam.zoom };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!cameraRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      startCamera: { ...cameraRef.current },
      dragDistance: 0,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !cameraRef.current) return;
    const dx = e.clientX - drag.startScreen.x;
    const dy = e.clientY - drag.startScreen.y;
    drag.dragDistance = Math.max(drag.dragDistance, Math.hypot(dx, dy));
    const zoom = drag.startCamera.zoom;
    cameraRef.current = clampCamera({
      x: drag.startCamera.x - dx / zoom,
      y: drag.startCamera.y - dy / zoom,
      zoom,
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.dragDistance >= DRAG_THRESHOLD) return; // was a pan, not a click

    const pos = screenToWorld(e.clientX, e.clientY);
    const clickedUnit = state.units.find((u) => Math.hypot(u.position.x - pos.x, u.position.y - pos.y) < Math.max(14, 14 / (cameraRef.current?.zoom ?? 1)));
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

  // Registered as a native, non-passive listener (see effect below) because
  // React attaches its synthetic onWheel as passive, which silently breaks
  // preventDefault and lets the page scroll underneath the map while zooming.
  function handleWheelNative(e: WheelEvent) {
    if (!cameraRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    const newZoom = Math.min(Math.max(cam.zoom * factor, MIN_ZOOM), MAX_ZOOM);
    const worldUnderCursor = {
      x: cam.x + (e.clientX - rect.left - rect.width / 2) / cam.zoom,
      y: cam.y + (e.clientY - rect.top - rect.height / 2) / cam.zoom,
    };
    cameraRef.current = clampCamera({
      x: worldUnderCursor.x - (e.clientX - rect.left - rect.width / 2) / newZoom,
      y: worldUnderCursor.y - (e.clientY - rect.top - rect.height / 2) / newZoom,
      zoom: newZoom,
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheelNative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomBy(factor: number) {
    if (!cameraRef.current) return;
    cameraRef.current = clampCamera({ ...cameraRef.current, zoom: cameraRef.current.zoom * factor });
  }

  return (
    <div className="map-viewport">
      <canvas
        ref={canvasRef}
        className={`strategic-map ${pendingOrder ? "targeting" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="map-controls">
        <button onClick={() => zoomBy(1.3)} title="Zoom in">
          +
        </button>
        <button onClick={() => zoomBy(1 / 1.3)} title="Zoom out">
          −
        </button>
        <button onClick={recenter} title="Recenter">
          ⌂
        </button>
      </div>
    </div>
  );
}
