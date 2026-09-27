import { useState } from "react";

export default function Home({ onJoin }: { onJoin: (code: string, name: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="screen home-screen">
      <div className="home-card">
        <h1>FRONTLINE</h1>
        <p className="subtitle">CRITICAL HOUR</p>
        <p className="tagline">A cooperative command simulation set in Karsia.</p>
        <label>
          Commander name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Commander" maxLength={24} />
        </label>
        <label>
          Campaign code (leave blank to create one)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="KARSIA-000000"
            maxLength={20}
          />
        </label>
        <button className="primary" onClick={() => onJoin(code, name || "Commander")}>
          {code.trim() ? "JOIN CAMPAIGN" : "CREATE CAMPAIGN"}
        </button>
      </div>
    </div>
  );
}
