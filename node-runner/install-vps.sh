#!/usr/bin/env bash
# ==============================================================================
# BlakeNode 1-Click VPS Host & Node Runner Installer (Ubuntu 22.04+ / Debian 12)
# Part of the BlakeVPN & BlakeNode Privacy-First DePIN Ecosystem on Starknet
# ==============================================================================
set -e

echo "================================================================"
echo "  BLAKENODE DEPIN HOST & WIREGUARD/SOCKS5 RELAY INSTALLER v1.1  "
echo "================================================================"

STARKNET_OPERATOR="${STARKNET_OPERATOR:-0xYOUR_STARKNET_WALLET_ADDRESS}"
BLAKE_REGION="${BLAKE_REGION:-EU-WEST-1}"
WG_PORT="${WG_PORT:-51820}"
SOCKS_PORT="${SOCKS_PORT:-1080}"
SBLAKE_CONTRACT="${SBLAKE_CONTRACT:-0x0123456789abcdef}"

if [ "$EUID" -ne 0 ]; then
  echo "[!] Please run as root (sudo bash install-vps.sh)"
  exit 1
fi

echo "[1/5] Updating system packages and installing WireGuard, Dante SOCKS5, & Node.js..."
apt-get update -y
apt-get install -y wireguard wireguard-tools iptables curl jq qrencode dante-server nodejs npm

echo "[2/5] Enabling IPv4 & IPv6 kernel packet forwarding..."
cat <<EOF > /etc/sysctl.d/99-blakenode.conf
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
sysctl --system

echo "[3/5] Generating BlakeNode WireGuard server keypair..."
mkdir -p /etc/wireguard
umask 077
if [ ! -f /etc/wireguard/privatekey ]; then
  wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
fi
SERVER_PRIV_KEY=$(cat /etc/wireguard/privatekey)
SERVER_PUB_KEY=$(cat /etc/wireguard/publickey)
DEFAULT_IFACE=$(ip route list default | awk '{print $5}' | head -n 1)
PUBLIC_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
Address = 10.88.0.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
EOF

systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0

echo "[4/5] Configuring zero-driver Browser Proxy SOCKS5 relay on port ${SOCKS_PORT}..."
cat <<EOF > /etc/danted.conf
logoutput: syslog
user.privileged: root
user.unprivileged: nobody
internal: 0.0.0.0 port=${SOCKS_PORT}
external: ${DEFAULT_IFACE}
socksmethod: none
clientmethod: none
client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: error
}
socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: error
}
EOF
systemctl enable danted || true
systemctl restart danted || true

echo "[5/5] Installing BlakeNode Starknet Heartbeat & Session Verifier Service..."
mkdir -p /opt/blakenode
cat <<EOF > /opt/blakenode/.env
STARKNET_OPERATOR=${STARKNET_OPERATOR}
BLAKE_REGION=${BLAKE_REGION}
SBLAKE_CONTRACT=${SBLAKE_CONTRACT}
WG_PUBLIC_KEY=${SERVER_PUB_KEY}
PUBLIC_ENDPOINT=${PUBLIC_IP}:${WG_PORT}
PROXY_ENDPOINT=${PUBLIC_IP}:${SOCKS_PORT}
EOF

echo "================================================================"
echo " ✓ BlakeNode VPS Provisioning Complete!"
echo "----------------------------------------------------------------"
echo " Node Region          : ${BLAKE_REGION}"
echo " Starknet Operator    : ${STARKNET_OPERATOR}"
echo " WireGuard Endpoint   : ${PUBLIC_IP}:${WG_PORT}"
echo " WireGuard Public Key : ${SERVER_PUB_KEY}"
echo " Browser Proxy SOCKS5 : ${PUBLIC_IP}:${SOCKS_PORT}"
echo "================================================================"
echo " Next Step: Bond this node in the BlakeVPN & BlakeNode Setup tab!"
