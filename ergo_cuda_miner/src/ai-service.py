from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import math

app = FastAPI()

# -------------------------------
# CORS Middleware (MUST be before routes)
# -------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # Set to ["http://localhost:3000"] etc if you want to restrict
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# SCHEMA DEFINITIONS
# -------------------------------

class GPUStats(BaseModel):
    temp: float
    util: float
    power: float

class JobMetadata(BaseModel):
    height: int
    difficulty: str  # Passed as string from JSON

class NonceRequest(BaseModel):
    gpuIndex: int
    currentNonce: int
    gpuStats: GPUStats
    jobMetadata: JobMetadata

class NonceResponse(BaseModel):
    nonceStart: int
    nonceEnd: int
    confidence: float

# -------------------------------
# GLOBAL STATE
# -------------------------------

nonce_state = {}
DEFAULT_STEP = 524288
MAX_NONCE = 2**64 - 1

# Load model
model = joblib.load("model.joblib")

# -------------------------------
# CORE LOGIC
# -------------------------------

def allocate_nonce_range(gpu_index: int, current_nonce: int) -> (int, int):
    last_nonce = nonce_state.get(gpu_index, {}).get("last_nonce", current_nonce)
    step_size = nonce_state.get(gpu_index, {}).get("step_size", DEFAULT_STEP)

    next_start = max(last_nonce + step_size, current_nonce)
    next_end = min(next_start + step_size, MAX_NONCE)

    nonce_state[gpu_index] = {
        "last_nonce": next_end,
        "step_size": step_size
    }

    return next_start, next_end

def predict_acceptance(stats: GPUStats, job: JobMetadata, nonce_range: int) -> float:
    try:
        diff_val = float(job.difficulty)
        diff_log = math.log10(diff_val + 1)

        features = np.array([[stats.temp, stats.util, stats.power, nonce_range, diff_log]], dtype=np.float32)
        result = model.predict(features)[0]
        return 0.95 if result == 1 else 0.55
    except Exception as e:
        raise ValueError(f"Model input error: {e}")

# -------------------------------
# ROUTES
# -------------------------------

@app.post("/recommend/nonce", response_model=NonceResponse)
def recommend_nonce_range(req: NonceRequest):
    try:
        nonce_start, nonce_end = allocate_nonce_range(req.gpuIndex, req.currentNonce)
        confidence = predict_acceptance(req.gpuStats, req.jobMetadata, nonce_end - nonce_start)
        return NonceResponse(nonceStart=nonce_start, nonceEnd=nonce_end, confidence=confidence)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------
# ENTRY POINT
# -------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7000)
