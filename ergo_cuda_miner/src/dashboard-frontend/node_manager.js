// dashboard-frontend/node_manager.js

const API_BASE = 'http://localhost:5050/api/ergo';

async function getReleases() {
    const res = await fetch(`${API_BASE}/releases`);
    return await res.json();
}

async function deployNode(version, configText) {
    const res = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({version, config: configText})
    });
    return await res.json();
}

async function startNode(node_dir) {
    const res = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({node_dir})
    });
    return await res.json();
}

async function getConfig(node_dir) {
    const res = await fetch(`${API_BASE}/config?node_dir=${encodeURIComponent(node_dir)}`);
    return await res.json();
}

async function saveConfig(node_dir, configText) {
    const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({node_dir, config: configText})
    });
    return await res.json();
}

async function getLog(node_dir) {
    const res = await fetch(`${API_BASE}/log?node_dir=${encodeURIComponent(node_dir)}`);
    if (!res.ok) return '';
    return await res.text();
}

export {
    getReleases, deployNode, startNode, getConfig, saveConfig, getLog
};
