import React, { useEffect, useState } from "react";

type MinerManagerProps = {
  network: "mainnet" | "testnet";
};

const API_BASE = "http://localhost:4201/api/miner";

export default function MinerManager({ network }: MinerManagerProps) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("POOL");
  const [accepted, setAccepted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [stats, setStats] = useState("");
  const [latestLog, setLatestLog] = useState("");

  // NEW: address/worker fields
  const [minerAddress, setMinerAddress] = useState("");
  const [worker, setWorker] = useState("Arohbe");
  const [savedConfig, setSavedConfig] = useState<{ minerAddress?: string; worker?: string }>({});

  // Sync network with backend when network prop changes
  useEffect(() => {
    if (network === "mainnet" || network === "testnet") {
      fetch(`${API_BASE}/network`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network }),
      });
    }
  }, [network]);

  // Fetch status and saved config
  const refreshStatus = async () => {
    const res = await fetch(`${API_BASE}/status`);
    const data = await res.json();
    setRunning(data.running);
    setMode(data.mode);
    setAccepted(data.accepted);
    setRejected(data.rejected);
    setStats(data.latestStats);
    setLatestLog(data.latestLogLine);
    if (data.minerAddress) setMinerAddress(data.minerAddress);
    if (data.worker) setWorker(data.worker);
    setSavedConfig({ minerAddress: data.minerAddress, worker: data.worker });
  };

  // Save address/worker config to backend before starting miner
  const saveConfig = async () => {
    const res = await fetch(`${API_BASE}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minerAddress, worker }),
    });
    const data = await res.json();
    setSavedConfig({ minerAddress: data.minerAddress, worker: data.worker });
  };

  const startMiner = async () => {
    await saveConfig(); // Save config first!
    await fetch(`${API_BASE}/start`, { method: "POST" });
    await refreshStatus();
  };

  const stopMiner = async () => {
    await fetch(`${API_BASE}/stop`, { method: "POST" });
    await refreshStatus();
  };

  const toggleMode = async () => {
    await fetch(`${API_BASE}/toggle`, { method: "POST" });
    await refreshStatus();
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: "#111", color: "#fff", padding: 24, borderRadius: 10 }}>
      <h2>Miner Control Panel</h2>
      <p>
        <b>Status:</b>{" "}
        <span style={{ color: running ? "lime" : "red" }}>
          {running ? "Running" : "Stopped"}
        </span>
      </p>
      <p>
        <b>Network:</b> {network}
      </p>
      <p>
        <b>Mode:</b> {mode}
      </p>
      <p>
        <b>Stats:</b> {stats || "Waiting for miner output..."}
      </p>
      <p>
        <b>Shares:</b> Accepted: {accepted} | Rejected: {rejected}
      </p>
      <p>
        <b>Latest Log:</b> <code>{latestLog.trim()}</code>
      </p>
      <form
        style={{
          margin: "16px 0",
          padding: 12,
          background: "#222",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 480,
        }}
        onSubmit={e => {
          e.preventDefault();
          saveConfig();
        }}
      >
        <label>
          Ergo Address:
          <input
            style={{ width: "100%" }}
            type="text"
            value={minerAddress}
            onChange={e => setMinerAddress(e.target.value)}
            placeholder="Ergo mainnet address"
            required
          />
        </label>
        <label>
          Worker Name:
          <input
            style={{ width: "100%" }}
            type="text"
            value={worker}
            onChange={e => setWorker(e.target.value)}
            placeholder="Worker (e.g. Arohbe)"
            required
          />
        </label>
        <div style={{ color: "#aaa", fontSize: 13 }}>
          <b>Current (saved):</b> {savedConfig.minerAddress}.{savedConfig.worker}
        </div>
        <button type="submit" style={{ width: 120 }}>Save Config</button>
      </form>
      <div style={{ marginTop: 16 }}>
        <button onClick={startMiner} disabled={running || !minerAddress || !worker}>
          Start Miner
        </button>{" "}
        <button onClick={stopMiner} disabled={!running}>
          Stop Miner
        </button>{" "}
        <button onClick={toggleMode}>Toggle Mode</button>
      </div>
    </div>
  );
}
