import React, { useState } from 'react';
import NodeManager from './nodemanager';
import MinerManager from './MinerManager';
import GpuMonitor from './GpuMonitor';
import AiInsights from './AiInsights';
import './App.css';

function App() {
  const [page, setPage] = useState<'mining' | 'node' | 'gpu' | 'ai'>('mining');
  const [network, setNetwork] = useState<"mainnet" | "testnet">("mainnet");

  return (
    <div className="App">
      <header>
        <h1>Cortex Mining Dashboard</h1>
        <nav style={{ margin: "1em 0" }}>
          <button onClick={() => setPage('mining')} style={{ marginRight: 12 }}>
            Mining Dashboard
          </button>
          <button onClick={() => setPage('node')} style={{ marginRight: 12 }}>
            Node Manager
          </button>
          <button onClick={() => setPage('gpu')} style={{ marginRight: 12 }}>
            GPU Monitor
          </button>
          <button onClick={() => setPage('ai')}>
            AI Insights
          </button>
        </nav>
        <div style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 16
        }}>
          <button
            onClick={() => setNetwork("mainnet")}
            style={{
              background: network === "mainnet" ? "#0078ff" : "#222",
              color: "#fff",
              marginRight: 6,
              minWidth: 90
            }}
          >
            Mainnet
          </button>
          <button
            onClick={() => setNetwork("testnet")}
            style={{
              background: network === "testnet" ? "#e38a00" : "#222",
              color: "#fff",
              minWidth: 90
            }}
          >
            Testnet
          </button>
        </div>
        <hr />
      </header>
      <main>
        {page === 'mining' && (
          <MinerManager network={network} />
        )}
        {page === 'node' && (
          <NodeManager network={network} setNetwork={setNetwork} />
        )}
        {page === 'gpu' && <GpuMonitor />}
        {page === 'ai' && <AiInsights />}
      </main>
    </div>
  );
}

export default App;
