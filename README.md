# Brain Harness

Brain Harness is an MCP (Model Context Protocol) server built on Fastify, with a small web **playground** for trying it out at `/playground` (it isn't linked from the site's pages). In the playground you can type or speak a prompt, watch Claude decide which of the server's tools to call, and run any tool or prompt template directly.

The web client's home page is the **Visualization Studio** (`/` opens `/studio`): 23 generative and algorithmic visualizations (Mandelbrot and Julia sets, L-systems, the Game of Life, reaction–diffusion, boids, sorting and maze algorithms, and more). Each one has knobs to tune it, presets (including an "Animated sweep" that slowly moves a setting so the picture morphs), and play/pause controls, and you can save your own versions, share them as links, or download them as images or videos. The Mandelbrot and Julia sets zoom with the mouse wheel, a pinch (touch screen or trackpad), or on-screen zoom buttons. It runs entirely in the browser and doesn't need the server. See [`specs/003-visualization-studio/quickstart.md`](specs/003-visualization-studio/quickstart.md), [`specs/004-studio-home-sweep/quickstart.md`](specs/004-studio-home-sweep/quickstart.md) and [`docs/adding-a-visualization.md`](docs/adding-a-visualization.md).

The longer-term goal is a versatile MCP server that connects to services like Slack and Telegram. The playground is where those integrations get built and tested.

## Folders

| Folder | What's in it |
|---|---|
| `server/` | The MCP server (Fastify + MCP SDK + Anthropic SDK). One file per tool in `server/src/mcp/tools/`. |
| `web-client/` | The playground and the Visualization Studio (Vite + React). Studio code is in `web-client/src/studio/`. |
| `docs/` | Guides: [`docs/adding-a-tool.md`](docs/adding-a-tool.md), [`docs/adding-a-visualization.md`](docs/adding-a-visualization.md), [`docs/deploy.md`](docs/deploy.md). |
| `deploy/` | EC2 setup script, systemd service and nginx config. |
| `.github/workflows/` | GitHub Actions that deploy the server and the web client to EC2. |
| `specs/` | The feature specs, plans and tasks this was built from. |

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
npm run dev               # studio: http://localhost:5173 · playground: http://localhost:5173/playground
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
