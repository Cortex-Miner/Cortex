import requests
import time

SEED_PEERS = [
    "127.0.0.1:9052",
]
MAX_DEPTH = 2
RECENT_SECONDS = 60 * 60 * 24 * 7  # 7 days for reference, but disables filtering below

def query_peers(ip_port):
    url = f"http://{ip_port}/peers/all"
    try:
        resp = requests.get(url, timeout=5)
        return resp.json()
    except Exception as e:
        print(f"Failed to query peers at {ip_port}: {e}")
        return {}

def query_info(ip_port):
    url = f"http://{ip_port}/info"
    try:
        resp = requests.get(url, timeout=5)
        info = resp.json()
        return {
            "height": info.get("fullHeight", None),
            "version": info.get("appVersion", None),
            "network": info.get("networkType", None)
        }
    except Exception:
        return None

def recentish(timestamp):
    """Returns True if timestamp is within RECENT_SECONDS, False if missing or old."""
    if not timestamp or timestamp == 0:
        return False
    now = int(time.time() * 1000)
    return (now - timestamp) < (RECENT_SECONDS * 1000)

def peer_addr_clean(address):
    if not address: return None
    return address.strip().lstrip("/")

def crawl(seed_peers, max_depth=2):
    seen = set()
    active = {}
    queue = [(p, 0) for p in seed_peers]

    while queue:
        peer, depth = queue.pop(0)
        if peer in seen or depth > max_depth:
            continue
        seen.add(peer)
        print(f"Querying peers at {peer} (depth {depth})...")
        peers = query_peers(peer)

        if isinstance(peers, dict):
            peer_iter = peers.values()
        elif isinstance(peers, list):
            peer_iter = peers
        else:
            peer_iter = []

        for pinfo in peer_iter:
            addr = peer_addr_clean(pinfo.get("address"))
            last_seen = pinfo.get("lastSeen", None)
            last_handshake = pinfo.get("lastHandshake", None)
            # Show all peers (and keep 'active' peers as those with a handshake in the last 7 days)
            if addr and addr not in active:
                print(f"  Found peer: {addr} (lastHandshake: {last_handshake}, name: {pinfo.get('name','-')})")
                queue.append((addr, depth+1))
                # Add as 'active' if handshake was recent (for the final table), else still record
                if recentish(last_handshake):
                    active[addr] = {}
    return active

def enrich_peer_data(peers):
    enriched = {}
    for addr in peers:
        print(f"  Querying /info for {addr} ...")
        info = query_info(addr)
        if info:
            enriched[addr] = info
        else:
            enriched[addr] = {"height": None, "version": None, "network": None}
        time.sleep(0.2)
    return enriched

if __name__ == "__main__":
    print("Crawling Ergo Testnet peers (with height/version)...\n")
    discovered = crawl(SEED_PEERS, max_depth=MAX_DEPTH)
    print("\nEnriching peer info with block height/version...")
    enriched = enrich_peer_data(discovered)
    sorted_peers = sorted(enriched.items(), key=lambda x: (x[1]["height"] or 0), reverse=True)
    print("\n%-22s  %-9s  %-10s  %s" % ("Peer", "Height", "Network", "Version"))
    print("-" * 64)
    for addr, info in sorted_peers:
        print("%-22s  %-9s  %-10s  %s" % (
            addr,
            str(info['height']) if info['height'] is not None else "-",
            str(info['network']) if info['network'] else "-",
            str(info['version']) if info['version'] else "-",
        ))
