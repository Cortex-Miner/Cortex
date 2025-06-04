# src/ergo_node.py
from flask import Blueprint, request, jsonify
import subprocess, os, threading, logging

ergo_bp = Blueprint('ergo', __name__)
NODE_DIR = os.path.expanduser("~/ergo-node")  # Directory to clone and run the node
JAR_NAME = None
logging.basicConfig(filename='ergo_node.log', level=logging.INFO,
                    format='%(asctime)s %(levelname)s:%(message)s')

@ergo_bp.route('/api/ergo/versions', methods=['GET'])
def get_versions():
    import requests
    try:
        resp = requests.get("https://api.github.com/repos/ergoplatform/ergo/releases")
        releases = resp.json()
        versions = [rel["tag_name"] for rel in releases if not rel.get("prerelease", False)]
        return jsonify(sorted(versions, reverse=True))
    except Exception as e:
        logging.error(f"Failed to fetch versions: {e}")
        return jsonify(error=str(e)), 500

@ergo_bp.route('/api/ergo/install', methods=['POST'])
def install_node():
    data = request.json
    version = data.get("version")
    if not version:
        return jsonify(error="No version specified"), 400
    thread = threading.Thread(target=build_node, args=(version,))
    thread.start()
    return jsonify(status="Building started"), 202

def build_node(version):
    try:
        logging.info(f"Starting build for Ergo {version}")
        check_and_install_deps()
        if os.path.exists(NODE_DIR):
            subprocess.run(["rm", "-rf", NODE_DIR], check=True)
        subprocess.run(["git", "clone", "--branch", version, "--depth", "1",
                        "https://github.com/ergoplatform/ergo.git", NODE_DIR], check=True)
        proc = subprocess.Popen(["sbt", "assembly"], cwd=NODE_DIR,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            logging.info(line.strip())
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError("sbt assembly failed")
        target_dir = os.path.join(NODE_DIR, "target/scala-2.13")
        jar_files = [f for f in os.listdir(target_dir) if f.startswith("ergo") and f.endswith(".jar")]
        if not jar_files:
            raise FileNotFoundError("Built JAR not found")
        global JAR_NAME
        JAR_NAME = jar_files[0]
        logging.info(f"Built Ergo JAR: {JAR_NAME}")
        os.makedirs(os.path.join(NODE_DIR, "node"), exist_ok=True)
        subprocess.run(["cp", os.path.join(target_dir, JAR_NAME),
                        os.path.join(NODE_DIR, "node", "ergo.jar")], check=True)
    except Exception as e:
        logging.error(f"Build failed: {e}")

def check_and_install_deps():
    try:
        subprocess.run(["java", "-version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except:
        logging.info("Installing OpenJDK 11")
        subprocess.run(["sudo", "apt-get", "update"], check=True)
        subprocess.run(["sudo", "apt-get", "install", "-y", "openjdk-11-jdk"], check=True)
    try:
        subprocess.run(["sbt", "sbtVersion"], check=True, stdout=subprocess.DEVNULL)
    except:
        logging.info("Installing SBT")
        subprocess.run(["echo", "deb https://repo.scala-sbt.org/scalasbt/debian all main | sudo tee /etc/apt/sources.list.d/sbt.list"], shell=True)
        subprocess.run(["curl -sL https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x99E82A75642AC823 | sudo apt-key add -"], shell=True)
        subprocess.run(["sudo", "apt-get", "update"], check=True)
        subprocess.run(["sudo", "apt-get", "install", "-y", "sbt"], check=True)

@ergo_bp.route('/api/ergo/config', methods=['GET','POST'])
def config_file():
    conf_path = os.path.join(NODE_DIR, "node", "ergo.conf")
    if request.method == 'GET':
        if os.path.exists(conf_path):
            with open(conf_path) as f:
                return jsonify(content=f.read())
        else:
            template = (
                'ergo {\n'
                '  networkType = "testnet"\n'
                '  node {\n'
                '    mining = false\n'
                '  }\n'
                '}\n'
                'scorex.restApi {\n'
                '  apiKeyHash = "<PLACE_YOUR_HASH_HERE>"\n'
                '}\n'
            )
            return jsonify(content=template)
    else:
        content = request.json.get('content', '')
        os.makedirs(os.path.join(NODE_DIR, "node"), exist_ok=True)
        with open(conf_path, 'w') as f:
            f.write(content)
        logging.info("ergo.conf updated by user")
        return jsonify(status="Config saved")

@ergo_bp.route('/api/ergo/launch', methods=['POST'])
def launch_node():
    try:
        max_mem = request.json.get("maxMemory", "4G")
        conf_path = os.path.join(NODE_DIR, "node", "ergo.conf")
        jar_path = os.path.join(NODE_DIR, "node", "ergo.jar")
        if not os.path.exists(jar_path) or not os.path.exists(conf_path):
            return jsonify(error="Node JAR or config missing"), 400
        cmd = ["java", f"-Xmx{max_mem}", "-jar", jar_path, "--testnet", "-c", conf_path]
        logging.info(f"Launching Ergo node: {' '.join(cmd)}")
        subprocess.Popen(cmd, cwd=os.path.join(NODE_DIR, "node"))
        return jsonify(status="Node started"), 200
    except Exception as e:
        logging.error(f"Failed to launch node: {e}")
        return jsonify(error=str(e)), 500
