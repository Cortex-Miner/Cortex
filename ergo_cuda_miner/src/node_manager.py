import os
import subprocess
import requests
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

ERGO_NODE_BASE = '/opt/ergo_nodes'  # or wherever you want to keep node builds

def list_github_releases():
    url = 'https://api.github.com/repos/ergoplatform/ergo/releases'
    resp = requests.get(url)
    releases = resp.json()
    return [
        {
            'tag_name': r['tag_name'],
            'zipball_url': r['zipball_url'],
            'published_at': r['published_at']
        }
        for r in releases
    ]

@app.route('/api/ergo/releases', methods=['GET'])
def api_list_releases():
    return jsonify(list_github_releases())

@app.route('/api/ergo/deploy', methods=['POST'])
def api_deploy_ergo():
    data = request.json
    version = data.get('version')
    config = data.get('config', '')
    node_dir = os.path.join(ERGO_NODE_BASE, version)
    os.makedirs(node_dir, exist_ok=True)
    # Download and extract
    releases = list_github_releases()
    selected = next((r for r in releases if r['tag_name'] == version), None)
    if not selected:
        return jsonify({'status': 'error', 'error': 'Release not found'}), 400
    zip_path = os.path.join(node_dir, 'ergo.zip')
    with requests.get(selected['zipball_url'], stream=True) as r:
        with open(zip_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    # Unzip
    subprocess.run(f'unzip -o {zip_path} -d {node_dir}', shell=True)
    # Find sbt or gradle project dir
    for root, dirs, files in os.walk(node_dir):
        if 'build.sbt' in files:
            project_dir = root
            break
    else:
        return jsonify({'status': 'error', 'error': 'build.sbt not found'}), 500
    # Save config
    config_path = os.path.join(project_dir, 'ergo.conf')
    with open(config_path, 'w') as f:
        f.write(config)
    # Build
    subprocess.run(f'cd "{project_dir}" && ./sbt assembly', shell=True)
    return jsonify({'status': 'ok', 'node_dir': project_dir})

@app.route('/api/ergo/start', methods=['POST'])
def api_start_ergo():
    data = request.json
    node_dir = data.get('node_dir')
    if not node_dir or not os.path.exists(node_dir):
        return jsonify({'status': 'error', 'error': 'node_dir not found'}), 400
    # Launch node
    log_path = os.path.join(node_dir, 'ergo.log')
    cmd = f'cd "{node_dir}" && nohup java -jar target/scala-*/ergo-*.jar --mainnet -c ergo.conf > "{log_path}" 2>&1 &'
    subprocess.run(cmd, shell=True)
    return jsonify({'status': 'ok', 'log': log_path})

@app.route('/api/ergo/config', methods=['GET', 'POST'])
def api_config_file():
    node_dir = request.args.get('node_dir') or request.json.get('node_dir')
    if not node_dir or not os.path.exists(node_dir):
        return jsonify({'status': 'error', 'error': 'node_dir not found'}), 400
    config_path = os.path.join(node_dir, 'ergo.conf')
    if request.method == 'GET':
        if not os.path.exists(config_path):
            return jsonify({'status': 'error', 'error': 'config not found'}), 404
        with open(config_path, 'r') as f:
            return jsonify({'status': 'ok', 'config': f.read()})
    else:
        config = request.json.get('config')
        with open(config_path, 'w') as f:
            f.write(config)
        return jsonify({'status': 'ok'})

@app.route('/api/ergo/log', methods=['GET'])
def api_log_file():
    node_dir = request.args.get('node_dir')
    log_path = os.path.join(node_dir, 'ergo.log')
    if os.path.exists(log_path):
        return send_file(log_path)
    return jsonify({'status': 'error', 'error': 'log not found'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050)
