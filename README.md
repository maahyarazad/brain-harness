# Brain Harness

Brain Harness is an MCP (Model Context Protocol) server built on Fastify, with a small web **playground** for trying it out. In the playground you can type or speak a prompt, watch Claude decide which of the server's tools to call, and run any tool or prompt template directly.

The longer-term goal is a versatile MCP server that connects to services like Slack and Telegram. The playground is where those integrations get built and tested.

## Folders

| Folder | What's in it |
|---|---|
| `server/` | The MCP server (Fastify + MCP SDK + Anthropic SDK). One file per tool in `server/src/mcp/tools/`. |
| `web-client/` | The playground (Vite + React). |
| `docs/` | Guides: [`docs/adding-a-tool.md`](docs/adding-a-tool.md), [`docs/deploy.md`](docs/deploy.md). |
| `deploy/` | EC2 setup script, systemd service and nginx config. |
| `.github/workflows/` | GitHub Actions that deploy the server and the web client to EC2. |
| `specs/` | The feature spec, plan and tasks this was built from. |

## Run it

You need Node.js 22.9+ and an Anthropic API key. Use Chrome or Edge for voice input.

```bash
# Terminal 1: server
cd server
npm install
cp .env.example .env      # then set ANTHROPIC_API_KEY=... in .env
npm run dev               # http://127.0.0.1:3000

# Terminal 2: playground
cd web-client
npm install
npm run dev               # open http://localhost:5173
```

**The API key lives only in `server/.env`.** That file is git-ignored, and the browser never sees the key. The playground talks to the server through Vite's dev proxy.

To pick a different model, set `ANTHROPIC_MODEL` in `server/.env` (default `claude-sonnet-5-5`).

## Endpoints

| Endpoint | For |
|---|---|
| `POST /mcp` | External MCP clients (Claude Desktop, Cursor, …): stateless Streamable HTTP |
| `GET /health` | Health check |
| `/api/*` | The playground: chat, list and run tools and prompts. See [the contract](specs/001-brain-harness-test-ui/contracts/http-api.md) |

## Deploy

Pushing to `main` deploys to EC2 through two GitHub Actions workflows. One-time setup and the required secrets are in [`docs/deploy.md`](docs/deploy.md).

## Tests

```bash
cd server && npm test        # uses a fake Claude client, so no API calls
cd web-client && npm test
```

Manual checks for every feature are in [`specs/001-brain-harness-test-ui/quickstart.md`](specs/001-brain-harness-test-ui/quickstart.md).

## Add your own tool

See [`docs/adding-a-tool.md`](docs/adding-a-tool.md). It's one new file and one line in `server/src/mcp/tools/index.js`, and the tool appears in the playground and over `/mcp` automatically.
