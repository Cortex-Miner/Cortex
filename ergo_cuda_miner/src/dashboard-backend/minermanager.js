import express from 'express';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from '../config.json' assert { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let minerProcess = null;
let miningMode = 'POOL'; // Default mode; can be toggled
let accepted = 0;
let rejected = 0;
let latestStats = '';
let latestLogLine = '';
let currentNetwork = "mainnet"; // Default network

// Store latest config from user input (default to file if present)
let dynamicConfig = {
  minerAddress: config.minerAddress || "",
  worker: config.worker || "Arohbe"
};

function getNodePort() {
  return currentNetwork === "testnet" ? 9052 : 9053;
}

// POST /api/miner/config — update address and worker from UI
router.post('/config', (req, res) => {
  const { minerAddress, worker } = req.body;
  if (typeof minerAddress === "string" && minerAddress.length > 20) {
    dynamicConfig.minerAddress = minerAddress;
  }
  if (typeof worker === "string" && worker.length > 0) {
    dynamicConfig.worker = worker;
  }
  res.json({ status: "ok", minerAddress: dynamicConfig.minerAddress, worker: dynamicConfig.worker });
});

// Always build <address>.<worker> for pool mining
function getWorkerAddress() {
  const address = dynamicConfig.minerAddress || "";
  let worker = dynamicConfig.worker || "Arohbe";
  if (address && !worker.startsWith(address + ".")) {
    worker = `${address}.${worker}`;
  }
  return worker;
}

function writeMinerConfig() {
  const port = getNodePort();
  const address = dynamicConfig.minerAddress || "";
  const worker = getWorkerAddress();

  const minerConfig = {
    mode: miningMode.toLowerCase(),
    solo: {
      host: "127.0.0.1",
      port: port
    },
    address: address,
    pool: {
      host: "65.108.57.232",
      port: 3052,
      ssl: false,
      worker: worker,
      password: "x"
    }
  };
  fs.writeFileSync(
    path.join(__dirname, "config.json"),
    JSON.stringify(minerConfig, null, 2)
  );
}

router.post('/network', (req, res) => {
  const { network } = req.body;
  if (network !== "mainnet" && network !== "testnet") {
    return res.status(400).json({ status: "error", message: "Invalid network" });
  }
  currentNetwork = network;
  console.log(`[MinerManager] Network set to: ${network}`);
  res.json({ status: "ok", network });
});

function getMinerArgs() {
  return [];
}

function startMiner() {
  if (minerProcess) return { status: 'already running' };

  try {
    writeMinerConfig();

    const minerPath = "/home/arohbe/ergo_cuda_miner/src/miner";
    console.log('[MinerManager] Spawning:', minerPath, getMinerArgs());
    minerProcess = spawn(minerPath, getMinerArgs());

    minerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      latestLogLine = output;

      if (output.includes('[DEBUG] Hashrate:')) {
        const match = output.match(/Hashrate: ([\d.]+) H\/s/);
        if (match) latestStats = `Hashrate: ${match[1]} H/s`;
      }

      if (output.includes('Accepted:')) {
        const match = output.match(/Accepted: (\d+) \| Rejected: (\d+)/);
        if (match) {
          accepted = parseInt(match[1]);
          rejected = parseInt(match[2]);
        }
      }

      if (output.includes('[GPU] Temp:')) {
        const match = output.match(/Temp: ([\d.]+).*Power: ([\d.]+).*Util: (\d+)%/);
        if (match) {
          latestStats += ` | Temp: ${match[1]}C, Power: ${match[2]}W, Util: ${match[3]}%`;
        }
      }
    });

    minerProcess.stderr.on('data', (data) => {
      console.error('[Miner ERROR]', data.toString());
      latestLogLine += data.toString();
    });

    minerProcess.on('exit', (code) => {
      console.log(`[Miner] Process exited with code ${code}`);
      minerProcess = null;
    });

    return { status: 'started' };
  } catch (err) {
    console.error('[MinerManager SPAWN ERROR]', err);
    return { status: 'spawn error', message: err.message, stack: err.stack };
  }
}

function stopMiner() {
  if (!minerProcess) return { status: 'not running' };
  minerProcess.kill();
  minerProcess = null;
  return { status: 'stopped' };
}

function toggleMiningMode() {
  miningMode = miningMode === 'POOL' ? 'SOLO' : 'POOL';
  return { status: 'mode switched', mode: miningMode };
}

function getMinerStatus() {
  return {
    running: !!minerProcess,
    mode: miningMode,
    accepted,
    rejected,
    latestStats,
    latestLogLine,
    currentNetwork,
    minerAddress: dynamicConfig.minerAddress,
    worker: dynamicConfig.worker
  };
}

router.post('/start', (req, res) => {
  try {
    const result = startMiner();
    if (result && result.status === 'already running') {
      return res.status(400).json(result);
    }
    if (result && result.status !== 'started') {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[MinerManager ERROR]', err);
    res.status(500).json({ status: 'error', message: err.message, stack: err.stack });
  }
});
router.post('/stop', (_, res) => res.json(stopMiner()));
router.post('/toggle', (_, res) => res.json(toggleMiningMode()));
router.get('/status', (_, res) => res.json(getMinerStatus()));

export default router;
