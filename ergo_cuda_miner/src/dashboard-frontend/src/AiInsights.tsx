import React, { useEffect, useState } from "react";

interface GpuStats {
  temp: number;
  util: number;
  power: number;
}

interface JobMetadata {
  height: number;
  difficulty: string;
}

interface NonceResponse {
  nonceStart: number;
  nonceEnd: number;
  confidence: number;
}

const AiInsights: React.FC = () => {
  const [gpuStats, setGpuStats] = useState<GpuStats | null>(null);
  const [jobMeta, setJobMeta] = useState<JobMetadata | null>(null);
  const [nonceInfo, setNonceInfo] = useState<NonceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch GPU stats
  const fetchGpuStats = async () => {
    try {
      const res = await fetch("/api/gpu/stats");
      const data = await res.json();
      setGpuStats(data.gpus[0]);
    } catch (err) {
      setError("Failed to fetch GPU stats");
    }
  };

  // Fetch node status (for block height + difficulty)
  const fetchNodeStatus = async () => {
    try {
      const res = await fetch("/api/node/status");
      const data = await res.json();
      setJobMeta({
        height: data.height,
        difficulty: data.blockDifficulty,
      });
    } catch (err) {
      setError("Failed to fetch node status");
    }
  };

  // Request nonce recommendation from AI API
  const requestNonceRecommendation = async () => {
    if (!gpuStats || !jobMeta) return;
    try {
      const res = await fetch("http://localhost:7000/recommend/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpuIndex: 0,
          currentNonce: 0,
          gpuStats,
          jobMetadata: jobMeta,
        }),
      });
      const data = await res.json();
      setNonceInfo(data);
      setError(null);
    } catch (err) {
      setError("Failed to reach AI API");
    }
  };

  // Poll every 5 seconds for new stats
  useEffect(() => {
    const poll = () => {
      fetchGpuStats();
      fetchNodeStatus();
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  // Request new nonce range each time stats update
  useEffect(() => {
    if (gpuStats && jobMeta) {
      requestNonceRecommendation();
    }
    // eslint-disable-next-line
  }, [gpuStats, jobMeta]);

  return (
    <div className="ai-insights-container" style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: "1rem" }}>
        AI Nonce Insights
      </h2>
      {error && (
        <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
      )}
      <div style={{ marginBottom: "1.5rem", padding: 16, background: "#f6f6fa", borderRadius: 12 }}>
        <h4>Current GPU Stats</h4>
        {gpuStats ? (
          <ul>
            <li>Temperature: <b>{gpuStats.temp}°C</b></li>
            <li>Utilization: <b>{gpuStats.util}%</b></li>
            <li>Power: <b>{gpuStats.power} W</b></li>
          </ul>
        ) : (
          <span>Loading GPU data...</span>
        )}
      </div>
      <div style={{ marginBottom: "1.5rem", padding: 16, background: "#f6f6fa", borderRadius: 12 }}>
        <h4>Current Job Metadata</h4>
        {jobMeta ? (
          <ul>
            <li>Block Height: <b>{jobMeta.height}</b></li>
            <li>Difficulty: <b>{jobMeta.difficulty}</b></li>
          </ul>
        ) : (
          <span>Loading job data...</span>
        )}
      </div>
      <div style={{ marginBottom: "2rem", padding: 16, background: "#e9f5f7", borderRadius: 12 }}>
        <h4>AI Nonce Recommendation</h4>
        {nonceInfo ? (
          <>
            <p>
              <b>Nonce Range:</b> {nonceInfo.nonceStart} – {nonceInfo.nonceEnd}
            </p>
            <p>
              <b>Confidence:</b>{" "}
              <span style={{ fontWeight: 700, color: nonceInfo.confidence > 0.8 ? "#27ae60" : "#e67e22" }}>
                {(nonceInfo.confidence * 100).toFixed(1)}%
              </span>
            </p>
          </>
        ) : (
          <span>Waiting for AI recommendation...</span>
        )}
      </div>
    </div>
  );
};

export default AiInsights;
