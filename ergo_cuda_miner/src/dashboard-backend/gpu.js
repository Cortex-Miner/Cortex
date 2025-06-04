import express from 'express';
import { execSync, exec } from 'child_process';

const router = express.Router();

// Helper: Can we use nvidia-settings?
function canUseNvidiaSettings() {
  try {
    execSync('nvidia-settings -q all', { stdio: 'ignore', env: { ...process.env } });
    return true;
  } catch {
    return false;
  }
}

// Parse nvidia-smi output
function parseNvidiaSmi(csv, controlsOverride) {
  return csv.trim().split('\n').map(line => {
    const [
      index, name, temp, util, fan, coreClock, memClock, power, powerLimit, memUsed, memTotal
    ] = line.split(',').map(s => s.trim());
    return {
      index: parseInt(index),
      name,
      temp: parseFloat(temp),
      util: parseFloat(util),
      fan: parseFloat(fan),
      coreClock: parseInt(coreClock),
      memClock: parseInt(memClock),
      power: parseFloat(power),
      powerLimit: parseFloat(powerLimit),
      memUsed: parseInt(memUsed),
      memTotal: parseInt(memTotal),
      controls: {
        fan: controlsOverride.fan,
        power: true,
        coreClock: controlsOverride.coreClock,
        memClock: controlsOverride.memClock,
      }
    };
  });
}

// GET /api/gpu/stats — Live stats for all GPUs
router.get('/stats', (req, res) => {
  try {
    const supportsNvidiaSettings = canUseNvidiaSettings();
    const cmd = 'nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,fan.speed,clocks.sm,clocks.mem,power.draw,power.limit,memory.used,memory.total --format=csv,noheader,nounits';
    const output = execSync(cmd).toString();
    const controls = {
      fan: supportsNvidiaSettings,
      coreClock: supportsNvidiaSettings,
      memClock: supportsNvidiaSettings,
    };
    res.json({ gpus: parseNvidiaSmi(output, controls), supportsNvidiaSettings });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// POST /api/gpu/overclock — Set OC/fan for a GPU
router.post('/overclock', (req, res) => {
  const { index, fan, powerLimit, coreClock, memClock } = req.body;
  if (typeof index !== 'number') return res.status(400).json({ error: 'GPU index required' });

  const supportsNvidiaSettings = canUseNvidiaSettings();
  const cmds = [];
  if (supportsNvidiaSettings) {
    if (fan !== undefined) cmds.push(`nvidia-settings -a [gpu:${index}]/GPUTargetFanSpeed=${fan}`);
    if (coreClock !== undefined) cmds.push(`nvidia-settings -a [gpu:${index}]/GPUGraphicsClockOffset[3]=${coreClock}`);
    if (memClock !== undefined) cmds.push(`nvidia-settings -a [gpu:${index}]/GPUMemoryTransferRateOffset[3]=${memClock}`);
  }
  if (powerLimit !== undefined)
    cmds.push(`nvidia-smi -i ${index} -pl ${powerLimit}`);

  if (cmds.length === 0) return res.json({ status: 'no changes' });

  let results = [];
  (function runCmd(i) {
    if (i >= cmds.length) {
      // If any had error, show that to user
      const failed = results.find(r => r.status !== 'success' || r.err);
      if (failed) {
        return res.status(500).json({
          status: 'error',
          message: `Failed: ${failed.err || failed.status}`,
          results,
          hint: !supportsNvidiaSettings ? "nvidia-settings may not be available (run with X or Xvfb)" : undefined
        });
      }
      return res.json({ status: 'ok', results });
    }
    exec(cmds[i], { env: { ...process.env } }, (err, stdout, stderr) => {
      results.push({
        cmd: cmds[i],
        out: stdout,
        err: stderr,
        status: err ? err.message : 'success'
      });
      runCmd(i + 1);
    });
  })(0);
});

export default router;
