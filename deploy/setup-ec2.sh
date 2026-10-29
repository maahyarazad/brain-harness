#!/usr/bin/env bash
# One-time setup of the EC2 instance for Brain Harness. Safe to re-run.
#
# Run it on the instance:
#   scp -i <key.pem> -r deploy ubuntu@13.63.233.210:/tmp/brain-harness-deploy
#   ssh -i <key.pem> ubuntu@13.63.233.210 'bash /tmp/brain-harness-deploy/setup-ec2.sh'
set -euo pipefail

APP_DIR=/var/www/brain-harness
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing Node.js 22, nginx and rsync"
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if systemctl is-active --quiet apache2; then
  echo "Apache is running on port 80. Stop it first (sudo systemctl disable --now apache2), then re-run." >&2
  exit 1
fi
sudo apt-get install -y nginx rsync
node -v

echo "==> Creating $APP_DIR"
sudo mkdir -p "$APP_DIR/server" "$APP_DIR/web-client"
sudo chown -R ubuntu:ubuntu "$APP_DIR"

echo "==> Installing the systemd service"
sudo cp "$HERE/brain-harness.service" /etc/systemd/system/brain-harness.service
sudo systemctl daemon-reload
sudo systemctl enable brain-harness

echo "==> Installing the nginx site"
sudo cp "$HERE/nginx-brain-harness.conf" /etc/nginx/sites-available/brain-harness
sudo ln -sf /etc/nginx/sites-available/brain-harness /etc/nginx/sites-enabled/brain-harness
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl restart nginx

echo "==> Done. Now run both GitHub deploy workflows."
