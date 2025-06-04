import json
import os
import time

# Make sure this path matches where your index.js writes share stats
SHARE_FILE = "/home/arohbe/ergo-stratum-server/share_log.json"

def load_shares():
    if not os.path.exists(SHARE_FILE):
        return {}
    with open(SHARE_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def display_dashboard():
    os.system('clear')  # or 'cls' on Windows
    shares = load_shares()
    print("==== Ergo Stratum Miner Dashboard ====")
    for address, stats in shares.items():
        print(f"Miner: {address}")
        print(f"  Accepted Shares : {stats.get('accepted', 0)}")
        print(f"  Rejected Shares : {stats.get('rejected', 0)}")
        print(f"  Last Share Time : {stats.get('last_share', 'N/A')}")
        print("--------------------------------------")

if __name__ == "__main__":
    while True:
        display_dashboard()
        time.sleep(5)  # refresh interval
