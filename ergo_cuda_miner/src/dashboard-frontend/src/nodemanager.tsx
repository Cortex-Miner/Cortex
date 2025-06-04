import React, { useEffect, useState } from "react";

type NodeManagerProps = {
  network: "mainnet" | "testnet";
  setNetwork: (net: "mainnet" | "testnet") => void;
};

const API_BASE = "http://localhost:4201/api/node";

// -- Config templates --
const DEFAULT_MAINNET_CONFIG = `ergo {
  node {
    mining = true
  }
  chain {
    reemission {
      checkReemissionRules = true
    }
  }
}
scorex {
  network {
    bindAddress = "0.0.0.0:9030"
    nodeName = "ErgoNode"
    declaredAddress = "YOUR_PUBLIC_IP:9030"
    cors = false
  }
  restApi {
    apiKeyHash = "add API key here from swagger later"
    bindAddress = "127.0.0.1:9053"
  }
}
`;

const DEFAULT_TESTNET_CONFIG = `ergo {
  node {
    mining = true
  }
  chain {
    reemission {
      checkReemissionRules = true
    }
  }
}
scorex {
  network {
    bindAddress = "0.0.0.0:9030"
    nodeName = "TestnetNode"
    declaredAddress = "YOUR_PUBLIC_IP:9030"
    cors = false
  }
  restApi {
    apiKeyHash = "add API key here from swagger later"
    bindAddress = "127.0.0.1:9053"
  }
  testnet = true
}
`;

export default function NodeManager({ network, setNetwork }: NodeManagerProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [config, setConfig] = useState<string>(
    network === "mainnet" ? DEFAULT_MAINNET_CONFIG : DEFAULT_TESTNET_CONFIG
  );
  const [deploying, setDeploying] = useState(false);
  const [log, setLog] = useState<string>("");
  const [status, setStatus] = useState<string>("stopped");
  const [deploymentDir, setDeploymentDir] = useState<string>("");
  const [swaggerUrl, setSwaggerUrl] = useState<string>("");
  const [dirWarning, setDirWarning] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/releases`)
      .then((res) => res.json())
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        );
        setVersions(sorted);
        if (sorted[0]) setSelectedVersion(sorted[0].tag_name);
      });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API_BASE}/status`)
        .then((res) => res.json())
        .then((data) => {
          setStatus(data.status);
          setLog(data.log || "");
          setDeploymentDir(data.deploymentDir || "");
          setSwaggerUrl(data.swaggerUrl || "");

          if (
            data.deploymentDir &&
            /ergo-node-(mainnet|testnet)-\d{10,}/.test(data.deploymentDir)
          ) {
            setDirWarning(
              "⚠️ The node is running from a *new temporary directory* each time. This will break peer discovery, sync, and wallet persistence. Configure your backend to use a fixed directory!"
            );
          } else {
            setDirWarning(null);
          }
        });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // When network changes (from parent), update config template accordingly
  useEffect(() => {
    setConfig(network === "mainnet" ? DEFAULT_MAINNET_CONFIG : DEFAULT_TESTNET_CONFIG);
  }, [network]);

  const handleDeploy = async () => {
    setDeploying(true);
    setLog("Deploying...");
    const resp = await fetch(`${API_BASE}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: selectedVersion, config, network }),
    });
    if (!resp.ok) {
      setLog("Error deploying node.");
      setDeploying(false);
    } else {
      setLog("Node deployment started.");
      setDeploying(false);
    }
  };

  const handleStopNode = async () => {
    setLog("Stopping node...");
    await fetch(`${API_BASE}/stop`, { method: "POST" });
    setLog("Node stopped.");
  };

  return (
    <div style={{ background: "#222", color: "#fff", padding: 24, borderRadius: 10 }}>
      <h2>Ergo Node Manager</h2>
      <div style={{ marginBottom: 12 }}>
        <label>Network: </label>
        <button
          style={{
            marginRight: 6,
            background: network === "mainnet" ? "#0078ff" : "#333",
            color: "#fff",
            borderRadius: 3,
            border: "none",
            padding: "6px 16px",
            cursor: network === "mainnet" ? "default" : "pointer",
          }}
          onClick={() => {
            setNetwork("mainnet");
            setConfig(DEFAULT_MAINNET_CONFIG);
          }}
          disabled={network === "mainnet"}
        >
          Mainnet
        </button>
        <button
          style={{
            background: network === "testnet" ? "#e38a00" : "#333",
            color: "#fff",
            borderRadius: 3,
            border: "none",
            padding: "6px 16px",
            cursor: network === "testnet" ? "default" : "pointer",
          }}
          onClick={() => {
            setNetwork("testnet");
            setConfig(DEFAULT_TESTNET_CONFIG);
          }}
          disabled={network === "testnet"}
        >
          Testnet
        </button>
      </div>
      <div>
        <label>Ergo Node Version: </label>
        <select
          value={selectedVersion}
          onChange={(e) => setSelectedVersion(e.target.value)}
        >
          {versions.map((ver) => (
            <option key={ver.tag_name} value={ver.tag_name}>
              {ver.tag_name} {ver.prerelease ? "(Pre-release)" : ""}{" "}
              {ver.published_at ? `(${ver.published_at.substring(0, 10)})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Node Config (ergo.conf):</label>
        <textarea
          style={{ width: "100%", height: 200, background: "#111", color: "#fff" }}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={handleDeploy} disabled={deploying || status === "running"}>
          {deploying ? "Deploying..." : `Deploy Node (${network})`}
        </button>
        <button
          onClick={handleStopNode}
          disabled={status !== "running"}
          style={{
            background: "#c0392b",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: 4,
          }}
        >
          Stop Node
        </button>
      </div>
      <div style={{ marginTop: 20, background: "#1a1a1a", padding: 10, borderRadius: 8 }}>
        <b>Node Status: </b>
        <span
          style={{
            color:
              status === "running"
                ? "lime"
                : status === "error"
                ? "red"
                : status === "deploying"
                ? "yellow"
                : "#ccc",
          }}
        >
          {status}
        </span>
        <pre
          style={{
            background: "#111",
            color: "#bfb",
            maxHeight: 300,
            overflow: "auto",
            marginTop: 10,
          }}
        >
          {log}
        </pre>
        {deploymentDir && (
          <div style={{ fontSize: 12, color: "#888" }}>
            Deployment dir: {deploymentDir}
            {dirWarning && (
              <div style={{ color: "#ffb347", fontWeight: 600, marginTop: 4 }}>
                {dirWarning}
              </div>
            )}
          </div>
        )}
      </div>
      {/* POST DEPLOYMENT STEPS */}
      <div style={{ marginTop: 24 }}>
        <h4>Post-Deployment Checklist</h4>
        <ol style={{ color: "#e4e4e4", lineHeight: 1.6 }}>
          <li>
            <b>Compute your API key hash:</b>
            Deploy and start the node, then click the Swagger link below, use <code>/utils/hashBlake2b</code> with your API key, and copy the result.
            {swaggerUrl && status === "running" && (
              <div style={{ margin: "8px 0" }}>
                <a
                  href={swaggerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#4ecdc4", fontWeight: "bold" }}
                >
                  Open Swagger UI
                </a>
              </div>
            )}
          </li>
          <li>
            <b>Stop the node & update config:</b>
            Stop the node, paste your API key hash into the <code>apiKeyHash</code> field of your config above, then redeploy.
            <div>
              <button
                onClick={handleStopNode}
                disabled={status !== "running"}
                style={{
                  background: "#c0392b",
                  color: "#fff",
                  border: "none",
                  padding: "4px 12px",
                  margin: "6px 0",
                  borderRadius: 4,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Stop Node & Edit Config
              </button>
            </div>
          </li>
          <li>
            <b>Open the node panel:</b>
            After updating the config and redeploying, open the panel below and finish wallet setup.
            <div style={{ margin: "8px 0" }}>
              <a
                href="http://127.0.0.1:9053/panel"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#4ecdc4", fontWeight: "bold" }}
              >
                Open Node Panel
              </a>
            </div>
          </li>
        </ol>
      </div>
      <div style={{ marginTop: 16, color: "#ccc" }}>
        <small>
          See{" "}
          <a
            href="https://docs.ergoplatform.com/node/install/manual/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#4ecdc4" }}
          >
            official docs
          </a>{" "}
          for help.
        </small>
      </div>
    </div>
  );
}
