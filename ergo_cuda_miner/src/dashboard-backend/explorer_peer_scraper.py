import requests
import re

EXPLORER_BLOCKS_URL = "https://testnet.ergoplatform.com/api/v1/blocks"
NUM_BLOCKS = 50   # How many latest blocks to scan

def get_recent_block_ips(num_blocks=50):
    print("Scraping recent block producers from testnet explorer...")
    peer_ips = set()
    # Get list of latest blocks
    blocks_url = f"{EXPLORER_BLOCKS_URL}?limit={num_blocks}"
    resp = requests.get(blocks_url)
    if resp.status_code != 200:
        print("Error: Could not fetch latest blocks from explorer.")
        return peer_ips

    block_data = resp.json()
    for block in block_data.get('items', []):
        # 'miner' can sometimes contain IP:port or a pool address string; let's try to parse
        miner = block.get('miner', '')
        # Try to extract IP:port (very rare, but some explorers show it; else you can use extra parsing on other fields)
        ip_ports = re.findall(r'(\d+\.\d+\.\d+\.\d+:\d+)', miner)
        for ipp in ip_ports:
            peer_ips.add(ipp)
        # You could extend this to try to resolve public key to node IP if the explorer exposes it

    return peer_ips

def print_known_peers_block(peer_ips):
    if not peer_ips:
        print("No peers found. (Testnet explorer may not expose raw node IPs directly.)")
        return
    print("\n# Paste this into your scorex.network.knownPeers in ergo.conf:\n")
    print("knownPeers = [")
    for ip in sorted(peer_ips):
        print(f'  "{ip}",')
    print("]")

if __name__ == "__main__":
    peer_ips = get_recent_block_ips(NUM_BLOCKS)
    print_known_peers_block(peer_ips)
