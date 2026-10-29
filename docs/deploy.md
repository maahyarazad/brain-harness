# Deploying Brain Harness to EC2

Two GitHub Actions workflows deploy to `ubuntu@13.63.233.210`, under `/var/www/brain-harness`:

| Workflow | Runs when | Does |
|---|---|---|
| `.github/workflows/deploy-server.yml` | push to `main` touching `server/**`, or run manually | tests → uploads `server/` to `/var/www/brain-harness/server` → writes `.env` from secrets → `npm ci --omit=dev` → reloads the `brain-harness` PM2 app → checks `/health` |
| `.github/workflows/deploy-web-client.yml` | push to `main` touching `web-client/**`, or run manually | tests → builds → uploads `dist/` to `/var/www/brain-harness/web-client` → checks the page loads |

How it runs on the instance:

```text
browser ──► nginx :443 ┬─ /            → /var/www/brain-harness/web-client (static)
                       └─ /api, /health, /mcp → Node on 127.0.0.1:3000 (PM2 app: brain-harness)
```

Port 3000 is not exposed. The playground calls `/api` on the same origin. The server also allows CORS from `https://ec2-13-63-233-210.eu-north-1.compute.amazonaws.com`, in case you set `API_BASE_URL` to call it directly.

## 1. Instance requirements

The instance is set up by hand and needs:

- Node.js 22.9+, PM2 (started at boot with `pm2 startup`) and rsync
- nginx with the site from [`deploy/nginx-brain-harness.conf`](../deploy/nginx-brain-harness.conf) (serves the playground and proxies `/api`, `/health`, `/mcp`)
- `/var/www/brain-harness` owned by `ubuntu`
- The deploy key's public half in `~/.ssh/authorized_keys`
- A self-signed certificate in `/etc/nginx/ssl/` (see [HTTPS](#https-self-signed))
- Security group inbound rules for **SSH (22)** from GitHub runners, **HTTP (80)** (redirects to HTTPS) and **HTTPS (443)**

The first server deploy creates the `brain-harness` PM2 app from `server/ecosystem.config.cjs`.

## 2. GitHub settings

In the repository, go to **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `EC2_SSH_KEY` | The full contents of the instance's **private** key (`.pem`), including the `BEGIN`/`END` lines |
| Secret | `ANTHROPIC_API_KEY` | Your Anthropic API key |
| Variable (optional) | `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| Variable (optional) | `API_BASE_URL` | Leave unset (same origin through nginx). Set it only to call the API on another origin. |

## 3. Deploy

Push to `main`, or go to **Actions → Deploy server / Deploy web client → Run workflow**. Deploy the server first. Then open https://ec2-13-63-233-210.eu-north-1.compute.amazonaws.com/.

## HTTPS (self-signed)

Let's Encrypt doesn't issue certificates for `*.compute.amazonaws.com` names, so the instance uses a self-signed certificate. HTTPS is also what lets the browser use the microphone for voice input.

Create the certificate once on the instance (valid for 825 days), then install the nginx site from [`deploy/nginx-brain-harness.conf`](../deploy/nginx-brain-harness.conf):

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout /etc/nginx/ssl/brain-harness.key \
  -out /etc/nginx/ssl/brain-harness.crt \
  -subj "/CN=ec2-13-63-233-210.eu-north-1.compute.amazonaws.com" \
  -addext "subjectAltName=DNS:ec2-13-63-233-210.eu-north-1.compute.amazonaws.com,IP:13.63.233.210"
sudo chmod 600 /etc/nginx/ssl/brain-harness.key
sudo nginx -t && sudo systemctl reload nginx
```

Browsers warn about the certificate until you trust it. To trust it on a Mac, copy it over and add it to the System keychain:

```bash
scp -i <your-key.pem> ubuntu@13.63.233.210:/etc/nginx/ssl/brain-harness.crt .
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain brain-harness.crt
```

Then restart the browser. For a certificate every visitor trusts without this step, point a domain you own at the instance and use certbot instead.

## Troubleshooting (on the instance)

```bash
pm2 list                                  # is the server running?
pm2 logs brain-harness --lines 100        # server logs
sudo nginx -t && sudo systemctl reload nginx
curl -s 127.0.0.1:3000/health
```

## ⚠️ Before sharing the URL

The playground and `/api/chat` are **public and unauthenticated**. Anyone who finds the URL can send prompts that are billed to your Anthropic key. CORS doesn't stop this: it only restricts browsers, not scripts. Restrict the security group's port 80 to your own IP, or add authentication, before leaving it running. A spend limit on the Anthropic key also helps.
