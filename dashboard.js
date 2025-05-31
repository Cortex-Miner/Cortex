const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const config = require('../../ergo-stratum-server/config.json');

let minerProcess = null;
let miningMode = 'POOL'; // or 'SOLO'
let accepted = 0, rejected = 0;
let latestStats = '';

function getMinerArgs() {
  const address = config.minerAddress;
  const pool = `${config.stratum.host}:${config.stratum.port}`;
  return miningMode === 'POOL'
    ? [`--pool`, pool, `--address`, address]
    : [`--solo`, `--address`, address];
}

function startMiner() {
  if (minerProcess) {
    console.log('[!] Miner already running.');
    return;
  }

  console.log(`[*] Starting miner in ${miningMode} mode...`);
  const minerPath = path.join(__dirname, 'miner');
  minerProcess = spawn(minerPath, getMinerArgs());

  minerProcess.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(output);

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
      const match = output.match(/Temp: ([\d.]+)\u00b0C, Power: ([\d.]+)W, Util: (\d+)%/);
      if (match) {
        latestStats += ` | Temp: ${match[1]}C, Power: ${match[2]}W, Util: ${match[3]}%`;
      }
    }
  });

  minerProcess.stderr.on('data', (data) => {
    process.stderr.write(`[ERROR] ${data.toString()}`);
  });

  minerProcess.on('exit', (code) => {
    console.log(`[!] Miner exited with code ${code}`);
    minerProcess = null;
  });
}

function stopMiner() {
  if (minerProcess) {
    minerProcess.kill();
    minerProcess = null;
    console.log('[*] Miner stopped.');
  } else {
    console.log('[!] Miner is not running.');
  }
}

function toggleMiningMode() {
  miningMode = miningMode === 'POOL' ? 'SOLO' : 'POOL';
  console.log(`[*] Switched to ${miningMode} mode.`);
}

function showMenu() {
  console.clear();
  console.log('--- Ergo Mining Dashboard ---');
  console.log('[s] Start Miner');
  console.log('[t] Stop Miner');
  console.log('[m] Toggle Mining Mode');
  console.log('[q] Quit');
  console.log('-----------------------------');
  console.log(`[MODE] ${miningMode}`);
  console.log(`[STATS] ${latestStats}`);
  console.log(`[SHARES] Accepted: ${accepted} | Rejected: ${rejected}`);
}

function runDashboard() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  showMenu();

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q') {
      stopMiner();
      rl.close();
      process.exit();
    }
    if (key.name === 's') startMiner();
    if (key.name === 't') stopMiner();
    if (key.name === 'm') toggleMiningMode();

    showMenu();
  });
}

runDashboard();
