import React, { useEffect, useState, useRef } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import SettingsIcon from "@mui/icons-material/Settings";

type GpuStat = {
  index: number;
  name: string;
  temp: number;
  util: number;
  fan: number;
  coreClock: number;
  memClock: number;
  power: number;
  powerLimit: number;
  memUsed: number;
  memTotal: number;
  controls: {
    fan: boolean;
    power: boolean;
    coreClock: boolean;
    memClock: boolean;
  };
};

type HistoryPoint = GpuStat & { time: number };

export default function GpuMonitor() {
  const [gpus, setGpus] = useState<GpuStat[]>([]);
  const [history, setHistory] = useState<{ [idx: number]: HistoryPoint[] }>({});
  const [ocValues, setOcValues] = useState<{ [idx: number]: any }>({});
  const [snackbar, setSnackbar] = useState<{ msg: string, type: "success" | "error" } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll stats every 2s
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("http://localhost:4201/api/gpu/stats");
        const data = await res.json();
        if (!data.gpus) throw new Error("No GPU stats found");
        setGpus(data.gpus);
        setHistory(prev => {
          const updated = { ...prev };
          data.gpus.forEach((gpu: GpuStat) => {
            if (!updated[gpu.index]) updated[gpu.index] = [];
            const arr = [...updated[gpu.index], { ...gpu, time: Date.now() }];
            updated[gpu.index] = arr.slice(-30); // last 60s if polling every 2s
          });
          return updated;
        });
      } catch (err: any) {
        setSnackbar({ msg: err.message, type: "error" });
      }
    };
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleOcChange = (idx: number, field: string, value: number) => {
    setOcValues(prev => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value }
    }));
  };

  const handleOcApply = async (gpu: GpuStat) => {
    const values = ocValues[gpu.index] || {};
    try {
      const body: any = { index: gpu.index };
      if (gpu.controls.fan && values.fan !== undefined) body.fan = values.fan;
      if (gpu.controls.power && values.powerLimit !== undefined) body.powerLimit = values.powerLimit;
      if (gpu.controls.coreClock && values.coreClock !== undefined) body.coreClock = values.coreClock;
      if (gpu.controls.memClock && values.memClock !== undefined) body.memClock = values.memClock;

      if (Object.keys(body).length <= 1) {
        setSnackbar({ msg: "No changes selected.", type: "error" });
        return;
      }

      const res = await fetch("http://localhost:4201/api/gpu/overclock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      // Try to parse as JSON, fallback if error (handles HTML error page)
      let resp;
      try {
        resp = await res.json();
      } catch {
        resp = {};
      }
      if (res.ok) {
        setSnackbar({ msg: "Settings applied!", type: "success" });
      } else {
        setSnackbar({ msg: resp.error || "Failed to apply settings", type: "error" });
      }
    } catch (err: any) {
      setSnackbar({ msg: err.message, type: "error" });
    }
  };

  return (
    <Box sx={{
      background: "linear-gradient(135deg, #181c28 70%, #19192a 100%)",
      minHeight: "100vh",
      py: 6, px: { xs: 1, sm: 4, md: 6 }
    }}>
      <Typography variant="h3" color="primary" gutterBottom align="center" sx={{ fontWeight: 700, letterSpacing: 1 }}>
        <SettingsIcon fontSize="large" /> GPU Monitor &amp; Control
      </Typography>
      {gpus.length > 0 && !gpus[0].controls.fan && (
        <Box sx={{
          color: "#FFCC00",
          background: "#232323",
          p: 2,
          borderRadius: 2,
          mb: 3,
          textAlign: "center",
          fontWeight: 600
        }}>
          ⚠️ Advanced fan and overclock controls are unavailable.<br />
          <span style={{ fontWeight: 400 }}>Run backend in a desktop environment or with Xvfb for full controls.</span>
        </Box>
      )}
      <Grid container spacing={4} justifyContent="center">
        {gpus.map(gpu => (
          <Grid item xs={12} sm={10} md={8} lg={6} key={gpu.index}>
            <Card sx={{
              borderRadius: 4,
              background: "linear-gradient(135deg, #232940 90%, #1b1e2c 100%)",
              boxShadow: 7,
              mb: 4,
            }}>
              <CardContent>
                <Typography variant="h5" color="secondary" gutterBottom sx={{ fontWeight: 600 }}>
                  {gpu.name} (#{gpu.index})
                </Typography>
                <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap", mb: 2 }}>
                  <Typography variant="h4" sx={{ color: "#ffbe0b" }}>
                    {gpu.temp}°C
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#00e676" }}>
                    {gpu.power}W
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#2979ff" }}>
                    {gpu.util}%
                  </Typography>
                  <Typography sx={{ color: "#b2b2b2" }}>
                    Fan: {gpu.fan}% | Clock: {gpu.coreClock} MHz | Mem: {gpu.memClock} MHz
                  </Typography>
                  <Typography sx={{ color: "#b2b2b2" }}>
                    VRAM: {gpu.memUsed} / {gpu.memTotal} MiB
                  </Typography>
                </Box>
                <Box sx={{ height: 180, mb: 2 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history[gpu.index] || []}>
                      <XAxis dataKey="time" hide />
                      <YAxis domain={['auto', 'auto']} />
                      <Tooltip
                        labelFormatter={t => new Date(t).toLocaleTimeString()}
                        formatter={(v: any, n: any) => [v, n.toUpperCase()]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="temp" stroke="#ffbe0b" dot={false} name="Temp" />
                      <Line type="monotone" dataKey="power" stroke="#00e676" dot={false} name="Power" />
                      <Line type="monotone" dataKey="util" stroke="#2979ff" dot={false} name="Util" />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {/* Overclock Controls */}
                <Box sx={{ mt: 2 }}>
                  {gpu.controls.fan && (
                    <Box mb={2}>
                      <Typography>Fan Speed (%)</Typography>
                      <Slider
                        min={0} max={100}
                        value={ocValues[gpu.index]?.fan ?? gpu.fan}
                        onChange={(_, v) => handleOcChange(gpu.index, "fan", v as number)}
                        valueLabelDisplay="auto"
                        sx={{ color: "#ffbe0b" }}
                      />
                    </Box>
                  )}
                  {gpu.controls.power && (
                    <Box mb={2}>
                      <Typography>Power Limit (W)</Typography>
                      <Slider
                        min={50} max={gpu.powerLimit}
                        value={ocValues[gpu.index]?.powerLimit ?? gpu.powerLimit}
                        onChange={(_, v) => handleOcChange(gpu.index, "powerLimit", v as number)}
                        valueLabelDisplay="auto"
                        sx={{ color: "#00e676" }}
                      />
                    </Box>
                  )}
                  {gpu.controls.coreClock && (
                    <Box mb={2}>
                      <Typography>Core Clock Offset (MHz)</Typography>
                      <Slider
                        min={-300} max={300}
                        value={ocValues[gpu.index]?.coreClock ?? 0}
                        onChange={(_, v) => handleOcChange(gpu.index, "coreClock", v as number)}
                        valueLabelDisplay="auto"
                        sx={{ color: "#2979ff" }}
                      />
                    </Box>
                  )}
                  {gpu.controls.memClock && (
                    <Box mb={2}>
                      <Typography>Memory Clock Offset (MHz)</Typography>
                      <Slider
                        min={-1000} max={2000}
                        value={ocValues[gpu.index]?.memClock ?? 0}
                        onChange={(_, v) => handleOcChange(gpu.index, "memClock", v as number)}
                        valueLabelDisplay="auto"
                        sx={{ color: "#ab47bc" }}
                      />
                    </Box>
                  )}
                  {(gpu.controls.fan || gpu.controls.power || gpu.controls.coreClock || gpu.controls.memClock) && (
                    <Button
                      variant="contained"
                      color="primary"
                      sx={{ mt: 2, px: 4, fontWeight: 600 }}
                      onClick={() => handleOcApply(gpu)}
                      startIcon={<SettingsIcon />}
                    >
                      Apply Changes
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {/* Snackbar for errors/success */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={5000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.type || "success"}>
          {snackbar?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
