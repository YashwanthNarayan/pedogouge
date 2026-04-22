#!/bin/bash
# Coturn one-time setup for the DO droplet.
# Usage: ./setup.sh DROPLET_IP DOMAIN COTURN_SECRET
# Example: ./setup.sh 1.2.3.4 turn.pedagogue.app $(openssl rand -hex 32)
set -euo pipefail

DROPLET_IP="${1:?DROPLET_IP required}"
DOMAIN="${2:?DOMAIN required}"
COTURN_SECRET="${3:?COTURN_SECRET required}"

echo "[coturn] Installing packages…"
apt-get update -qq && apt-get install -y coturn certbot

echo "[coturn] Obtaining TLS certificate for ${DOMAIN}…"
certbot certonly --standalone -d "${DOMAIN}" \
  --agree-tos --non-interactive -m "admin@${DOMAIN}"

echo "[coturn] Writing configuration…"
cp "$(dirname "$0")/turnserver.conf" /etc/coturn/turnserver.conf
sed -i "s/DROPLET_IP/${DROPLET_IP}/g"     /etc/coturn/turnserver.conf
sed -i "s/COTURN_SECRET/${COTURN_SECRET}/g" /etc/coturn/turnserver.conf
sed -i "s/DOMAIN/${DOMAIN}/g"              /etc/coturn/turnserver.conf

# Enable the systemd service (Ubuntu package ships disabled by default)
sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn || true

echo "[coturn] Enabling and starting coturn…"
systemctl enable coturn
systemctl restart coturn
systemctl status coturn --no-pager

echo ""
echo "Done. Test with:"
echo "  turnutils_uclient -T -u test -w ${COTURN_SECRET} ${DROPLET_IP}"
echo ""
echo "Open these ports in the DO firewall:"
echo "  3478/udp  3478/tcp  5349/tcp  49152-65535/udp"
