// ---- GPU Automode: Detect or launch Xvfb if needed ----
import { execSync } from "child_process";
let xFound = false;

function tryDisplay(disp) {
  try {
    execSync(`nvidia-settings -q all`, { env: { ...process.env, DISPLAY: disp }, stdio: 'ignore' });
    process.env.DISPLAY = disp;
    xFound = true;
    console.log(`[GPU-AutoX] Using DISPLAY=${disp}`);
    return true;
  } catch { return false; }
}

// Try system X first (for desktop users)
if (!tryDisplay(":0")) {
  // Try launching Xvfb for headless use
  try {
    execSync('pgrep Xvfb || (Xvfb :0 -screen 0 1024x768x16 &)', { stdio: 'ignore' });
    // Wait a moment for Xvfb to be ready
    setTimeout(() => tryDisplay(":0"), 700);
  } catch (err) {
    console.warn("[GPU-AutoX] Could not start Xvfb or find working X server. Fan/OC controls may be unavailable.");
  }
}
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import axios from "axios";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import minerManager from "./minermanager.js";
import gpuRoutes from './gpu.js';

const app = express();         // <-- This must come BEFORE all app.use()
const PORT = 4201;

app.use(cors());
app.use(express.json());

// Mount routes after app is defined!
app.use("/api/miner", minerManager); 
app.use('/api/gpu', gpuRoutes);

let nodeProcess = null;
let nodeLogBuffer = [];
let nodeStatus = "stopped";
let runningNetwork = "mainnet";
let staticDirs = {
  mainnet: path.join(process.cwd(), "ergo-node-mainnet"),
  testnet: path.join(process.cwd(), "ergo-node-testnet"),
};
let jarPath = {
  mainnet: null,
  testnet: null,
};
let configPath = {
  mainnet: null,
  testnet: null,
};

function appendNodeLog(line) {
  nodeLogBuffer.push(line);
  if (nodeLogBuffer.length > 2000) nodeLogBuffer = nodeLogBuffer.slice(-2000);
}

// --- Snapshot Restore Helper ---
function restoreTestnetSnapshot(deploymentDir) {
  const SNAPSHOT_FILENAME = "testnet-snapshot.tar.gz";
  const snapshotPath = path.join(deploymentDir, SNAPSHOT_FILENAME);
  const ergoDbPath = path.join(deploymentDir, ".ergo");

  if (fs.existsSync(snapshotPath)) {
    // Remove old .ergo data
    if (fs.existsSync(ergoDbPath)) {
      try {
        fs.rmSync(ergoDbPath, { recursive: true, force: true });
        appendNodeLog("[INFO] Old .ergo database deleted.");
      } catch (err) {
        appendNodeLog("[ERROR] Failed to remove old .ergo: " + err.toString());
      }
    }
    // Extract snapshot
    try {
      appendNodeLog(`[INFO] Extracting snapshot from ${SNAPSHOT_FILENAME}...`);
      execSync(`tar -xvf ${SNAPSHOT_FILENAME}`, { cwd: deploymentDir });
      appendNodeLog("[INFO] Snapshot extracted successfully.");
    } catch (err) {
      appendNodeLog("[ERROR] Snapshot extraction failed: " + err.toString());
    }
  } else {
    appendNodeLog("[INFO] No snapshot file found, starting from scratch.");
  }
}

// --- Node Release List ---
app.get("/api/node/releases", async (req, res) => {
  try {
    const ghResp = await fetch("https://api.github.com/repos/ergoplatform/ergo/releases?per_page=100");
    const releases = await ghResp.json();
    const mapped = releases.map((rel) => ({
      tag_name: rel.tag_name,
      name: rel.name || rel.tag_name,
      prerelease: rel.prerelease,
      published_at: rel.published_at,
      url: rel.assets[0]?.browser_download_url,
      body: rel.body,
    }));
    res.json(mapped);
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

// --- Node Deploy/Start ---
app.post("/api/node/deploy", async (req, res) => {
  try {
    const { version, config, network } = req.body;
    if (!version || !config || !network)
      return res.status(400).json({ error: "Missing version, config, or network" });

    if (!["mainnet", "testnet"].includes(network)) {
      return res.status(400).json({ error: "Invalid network type." });
    }

    if (nodeProcess && nodeStatus === "running") {
      return res.status(400).json({ error: "Node already running" });
    }

    nodeStatus = "deploying";
    nodeLogBuffer = [];
    runningNetwork = network;
    const deploymentDir = staticDirs[network];

    // Ensure directory exists
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
      appendNodeLog(`[INFO] Created static deployment dir: ${deploymentDir}`);
    } else {
      appendNodeLog(`[INFO] Using existing deployment dir: ${deploymentDir}`);
    }

    // Download jar if needed
    const releasesResp = await fetch("https://api.github.com/repos/ergoplatform/ergo/releases?per_page=100");
    const releases = await releasesResp.json();
    const chosen = releases.find((r) => r.tag_name === version || r.name === version);
    if (!chosen) {
      appendNodeLog("[ERROR] Selected version not found in GitHub releases.");
      nodeStatus = "error";
      return res.status(404).json({ error: "Version not found" });
    }

    const asset = chosen.assets.find((a) => a.name.endsWith(".jar"));
    if (!asset) {
      appendNodeLog("[ERROR] No .jar found for this release.");
      nodeStatus = "error";
      return res.status(404).json({ error: "No jar found" });
    }

    const jarFilename = path.join(deploymentDir, asset.name);
    jarPath[network] = jarFilename;

    if (!fs.existsSync(jarFilename)) {
      appendNodeLog(`[INFO] Downloading Ergo node: ${asset.browser_download_url}`);
      const fileStream = fs.createWriteStream(jarFilename);
      const resp = await fetch(asset.browser_download_url);
      await new Promise((resolve, reject) => {
        resp.body.pipe(fileStream);
        resp.body.on("error", reject);
        fileStream.on("finish", resolve);
      });
      appendNodeLog("[INFO] Ergo node downloaded.");
    } else {
      appendNodeLog(`[INFO] Using cached jar: ${jarFilename}`);
    }

    // Write/ensure config
    let fixedConfig = config;
    if (!/mining\s*=\s*true/.test(fixedConfig)) {
      fixedConfig = fixedConfig.replace(/node\s*{/, "node {\n    mining = true");
      appendNodeLog("[INFO] Inserted mining = true into config.");
    }
    const confPath = path.join(deploymentDir, "ergo.conf");
    fs.writeFileSync(confPath, fixedConfig);
    configPath[network] = confPath;
    appendNodeLog(`[INFO] Config written to ${confPath}`);

    // --- SNAPSHOT RESTORE (for testnet) ---
    if (network === "testnet") {
      restoreTestnetSnapshot(deploymentDir);
    }

    nodeStatus = "running";
    let jarCmd = ["-jar", jarFilename];

    if (network === "testnet") {
      jarCmd.push("--testnet");
    } else if (network === "mainnet") {
      jarCmd.push("--mainnet");
    }

    jarCmd.push("-c", "ergo.conf");
    nodeProcess = spawn("java", jarCmd, { cwd: deploymentDir });

    nodeProcess.stdout.on("data", (data) => appendNodeLog("[NODE] " + data.toString()));
    nodeProcess.stderr.on("data", (data) => appendNodeLog("[NODE-ERR] " + data.toString()));
    nodeProcess.on("exit", (code) => {
      appendNodeLog(`[NODE] Exited with code ${code}`);
      nodeStatus = "stopped";
      nodeProcess = null;
    });

    res.json({ status: "ok", deploymentDir });
  } catch (err) {
    appendNodeLog("[ERROR] " + err.toString());
    nodeStatus = "error";
    res.status(500).json({ error: err.toString() });
  }
});

// --- Node Stop ---
app.post("/api/node/stop", (req, res) => {
  if (nodeProcess && nodeStatus === "running") {
    nodeProcess.kill("SIGTERM");
    nodeStatus = "stopped";
    appendNodeLog("[INFO] Node process stopped by user.");
    nodeProcess = null;
    res.json({ status: "stopped" });
  } else {
    res.status(400).json({ error: "Node not running" });
  }
});

// --- Node Config Update ---
app.post("/api/node/config", (req, res) => {
  const { config, network } = req.body;
  const confPath = configPath[network || "mainnet"];
  if (!confPath) return res.status(404).json({ error: "Config file not found for this network" });
  try {
    fs.writeFileSync(confPath, config);
    appendNodeLog(`[INFO] Config updated for ${network}.`);
    res.json({ status: "ok" });
  } catch (e) {
    appendNodeLog("[ERROR] " + e.toString());
    res.status(500).json({ error: e.toString() });
  }
});

// --- Node Status API (returns live block height + difficulty!) ---
app.get("/api/node/status", async (req, res) => {
  let swaggerUrl = "http://127.0.0.1:9053/swagger";
  try {
    const nodeResp = await axios.get("http://127.0.0.1:9053/info");
    const { fullHeight, difficulty } = nodeResp.data;
    res.json({
    height: fullHeight,
    blockDifficulty: String(difficulty),
      status: nodeStatus,
      log: nodeLogBuffer.slice(-200).join("\n"),
      network: runningNetwork,
      swaggerUrl,
      jarPath,
      configPath,
    });
  } catch (err) {
    res.status(500).json({
      error: "Could not fetch node info: " + err.message,
      status: nodeStatus,
      log: nodeLogBuffer.slice(-200).join("\n"),
      network: runningNetwork,
      swaggerUrl,
      jarPath,
      configPath,
    });
  }
});

app.listen(PORT, () => {
  console.log(`NodeManager server running at http://localhost:${PORT}`);
});
