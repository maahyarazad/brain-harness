# Deploying Brain Harness to EC2

Two GitHub Actions workflows deploy to `ubuntu@13.63.233.210`, under `/var/www/brain-harness`:

| Workflow | Runs when | Does |
|---|---|---|
| `.github/workflows/deploy-server.yml` | push to `main` touching `server/**`, or run manually | tests → uploads `server/` to `/var/www/brain-harness/server` → writes `.env` from secrets → `npm ci --omit=dev` → restarts the `brain-harness` service → checks `/health` |
| `.github/workflows/deploy-web-client.yml` | push to `main` touching `web-client/**`, or run manually | tests → builds → uploads `dist/` to `/var/www/brain-harness/web-client` → checks the page loads |

How it runs on the instance:

```text
browser ──► nginx :80 ─┬─ /            → /var/www/brain-harness/web-client (static)
                       └─ /api, /health, /mcp → Node on 127.0.0.1:3000 (systemd: brain-harness)
```

Port 3000 is not exposed. The playground calls `/api` on the same origin. The server also allows CORS from `http://ec2-13-63-233-210.eu-north-1.compute.amazonaws.com`, in case you set `API_BASE_URL` to call it directly.

## 1. One-time instance setup

The setup script installs Node 22, nginx and rsync, the systemd service, and the nginx site, replacing the default site. Run it once from your machine:

```bash
scp -i <your-key.pem> -r deploy ubuntu@13.63.233.210:/tmp/brain-harness-deploy
ssh -i <your-key.pem> ubuntu@13.63.233.210 'bash /tmp/brain-harness-deploy/setup-ec2.sh'
```

Make sure the EC2 security group allows inbound **HTTP (80)**.

## 2. GitHub settings

In the repository, go to **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `EC2_SSH_KEY` | The full contents of the instance's **private** key (`.pem`), including the `BEGIN`/`END` lines |
| Secret | `ANTHROPIC_API_KEY` | Your Anthropic API key |
| Variable (optional) | `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| Variable (optional) | `API_BASE_URL` | Leave unset (same origin through nginx). Set it only to call the API on another origin. |

## 3. Deploy

Push to `main`, or go to **Actions → Deploy server / Deploy web client → Run workflow**. Deploy the server first. Then open http://ec2-13-63-233-210.eu-north-1.compute.amazonaws.com/.

## Troubleshooting (on the instance)

```bash
sudo systemctl status brain-harness       # is the server running?
journalctl -u brain-harness -n 100        # server logs
sudo nginx -t && sudo systemctl reload nginx
curl -s 127.0.0.1:3000/health
```

## ⚠️ Before sharing the URL

The playground and `/api/chat` are **public and unauthenticated**. Anyone who finds the URL can send prompts that are billed to your Anthropic key. CORS doesn't stop this: it only restricts browsers, not scripts. Restrict the security group's port 80 to your own IP, or add authentication, before leaving it running. A spend limit on the Anthropic key also helps.
