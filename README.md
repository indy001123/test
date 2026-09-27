# Frontline: Critical Hour

A browser-based, 2–4 player cooperative military command simulator set in the
fictional country of Karsia. Players take on different command roles and
have to keep a campaign from collapsing under incomplete information,
limited resources, and constantly changing threats.

This repository currently contains the **first vertical-slice milestone**:
a small but fully playable, fully multiplayer-synchronized core loop. It is
intentionally narrow in scope — see "What's built" and "What's next" below.

## Architecture

```
packages/
  shared/   Types, data-driven unit definitions, and math helpers shared
            between client and server (the wire protocol lives here too).
  server/   Authoritative Node.js + WebSocket server. Owns all game state,
            runs the simulation tick, and validates every player command.
            The browser is never trusted to decide outcomes.
  client/   React + TypeScript + Canvas web app. Pure rendering + input;
            sends "intent" messages and renders whatever the server says
            actually happened.
```

The server runs an authoritative simulation loop at 2 ticks/second
(`SIM_TICK_MS` in `packages/shared/src/data.ts`), independent from the
browser's render rate, per the "simulation vs. rendering" performance
guidance in the design spec.

Multiplayer: campaigns are rooms (`CampaignRoom` in
`packages/server/src/room.ts`) keyed by a campaign code (also used as the
deterministic RNG seed, so a shared code reproduces the same scenario). A
player who disconnects keeps their role reserved and can reconnect by
resending their `playerId` (persisted client-side in `localStorage`); the
campaign keeps running while they're away.

## What's built (vertical slice)

- One region (Karsan Valley) bordering one enemy region (Sarrow Ridge).
- Two bases (Forward Base Alpha, Forward Base Bravo) with live fuel /
  supplies / ammo pools and per-tick upkeep.
- 8 units across two playable roles: **Ground Command** (infantry, recon,
  armor) and **Logistics Command** (supply/fuel trucks). Air Command and
  Intelligence & Operations are visible in the lobby as locked/"coming
  soon" roles — the interdependent 4-role design is scoped for phase 2.
- Orders: MOVE, PATROL, DEFEND, RECON, WITHDRAW, server-validated against
  unit ownership (a Ground player cannot command Logistics units, etc).
- One convoy system: Logistics dispatches a convoy with real cargo from one
  base to another; it travels over time, can be delayed by a random event,
  and delivers resources into the destination base on arrival.
- One enemy contact with basic fog-of-war: visibility/confidence is a
  function of friendly unit proximity, and the contact reacts to nearby
  friendly strength (avoids clustered defenders, otherwise advances).
- A small data-driven random event table (mechanical breakdowns, convoy
  delays, comms flicker) that can fire mid-campaign.
- One objective ("resupply Forward Base Bravo before it runs dry") with a
  real win/fail condition tied to simulation state.
- A lobby (create/join by campaign code, role picker, start-when-ready),
  a live event feed, team chat, and an end-of-campaign summary overlay.

## What's next (not built yet, by design)

This slice deliberately stops at "two people can open the game, join the
same campaign, move units, see each other's changes, respond to an event,
and complete an objective" before going further, per the project's own
phased spec. Not yet built: Air Command / Intelligence & Operations roles
and the true per-role information asymmetry they enable, weather/day-night,
save/load, a full campaign report, audio, and visual polish/animation.

## Running it

```bash
npm install
npm run build            # builds shared -> server -> client

# two terminals:
npm run dev:server       # ws server on :8080
npm run dev:client       # vite dev server on :5173 (proxies /ws to :8080)
```

Open `http://localhost:5173` in two browser tabs/windows, pick "Create
Campaign" in the first (leave the code blank), copy the generated code into
the second tab's "join" field, pick Ground in one tab and Logistics in the
other, and start the campaign.

## Testing

```bash
npm run build
npm test                 # vitest unit tests (server simulation/commands, shared math)
npm run smoke            # spins up the real server and drives two real
                          # WebSocket clients through join -> roles -> start
                          # -> orders -> convoy -> objective progress -> chat
```

The unit + integration tests cover: deterministic scenario generation from
a seed, base upkeep, convoy cargo deduction/delivery, objective
completion/failure, and command validation (role ownership, out-of-bounds
target clamping). The UI has additionally been manually verified end-to-end
in a real Chromium browser (two simultaneous sessions joining one campaign,
issuing orders, dispatching a convoy, and exchanging chat).
