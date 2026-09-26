import type { GameEvent } from "@frontline/shared";
import { TICKS_PER_SEC } from "@frontline/shared";

function formatClock(elapsedSec: number): string {
  const m = Math.floor(elapsedSec / 60);
  const s = Math.floor(elapsedSec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function EventFeed({ events }: { events: GameEvent[] }) {
  const recent = [...events].slice(-30).reverse();
  return (
    <div className="event-feed">
      {recent.map((e) => (
        <div key={e.id} className={`event-row severity-${e.severity}`}>
          <span className="event-time">{formatClock(e.tick / TICKS_PER_SEC)}</span>
          <span className="event-text">{e.text}</span>
        </div>
      ))}
    </div>
  );
}
