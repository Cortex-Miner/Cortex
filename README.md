
# 🧠 Cortex: AI-Optimized GPU Miner for Ergo

Cortex is an open-source, CUDA-based GPU miner for the Ergo blockchain. Built for transparency, efficiency, and smart AI-powered tuning, it includes full node deployment, real-time GPU control, and optional pool or solo mining support.

---

## 📁 Project Structure

```
cortex/
├── dashboard-frontend/     # React UI dashboard
├── backend-server/         # Node.js control server
├── ai-service/             # FastAPI AI backend
├── miner/                  # CUDA GPU miner
├── config/                 # Config and runtime settings
```

---

## 🧩 Dependencies

### 🖥 Frontend (React)
- Node.js ≥ 18
- npm or yarn

```bash
cd dashboard-frontend
npm install
npm start
```

---

### ⚙️ Backend Server (Node.js)
- Node.js ≥ 18
- Linux
- `nvidia-smi` (required)
- `nvidia-settings` (optional, needs X or Xvfb)

```bash
cd backend-server
npm install
node server.js
```

---

### 🚀 CUDA Miner (C++)
- NVIDIA GPU & CUDA drivers
- CUDA Toolkit ≥ 11.4
- g++ ≥ 11
- make

```bash
cd miner
make clean && make
```

---

### 🧠 AI Service (FastAPI)
- Python 3.10+
- FastAPI, Uvicorn, Pydantic

```bash
cd ai-service
pip install -r requirements.txt
uvicorn ai-service:app --host 0.0.0.0 --port 7000
```

---

## 🔧 Deployment Workflow

### 1. Deploy Node (via UI or API)

```bash
curl -X POST http://localhost:4201/api/node/deploy
```

### 2. Start Dashboard

```bash
cd dashboard-frontend
npm start
```

### 3. Launch Miner (solo or pool)

```bash
curl -X POST http://localhost:4201/api/miner/start
```

### 4. Monitor GPU Stats

```bash
curl http://localhost:4201/api/gpu/stats
```

---

## 🌐 Network Switching

```bash
curl -X POST http://localhost:4201/api/miner/network -H "Content-Type: application/json" -d '{"network":"testnet"}'
```

---

## 🧠 AI Features (WIP)
- 📊 Nonce Partitioning
- 🔍 GPU Health Monitoring
- 📚 SQL-based Training Data Collection

---

## ⚠️ Known Issues
- `nvidia-settings` requires X or Xvfb on Linux
- Testnet snapshot sync may fail; full sync suggested
- Default mode is Pool Mining (more stable for demo/testing)

---

## 📡 Port Reference

| Component        | Port  |
|------------------|-------|
| Frontend UI      | 3000  |
| Backend API      | 4201  |
| Ergo Node API    | 9053  |
| AI Service       | 7000  |

---