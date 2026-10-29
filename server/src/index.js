import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Brain Harness ready at http://${config.host}:${config.port} (MCP: /mcp)`);
  if (!config.hasApiKey) {
    app.log.warn("ANTHROPIC_API_KEY is not set: chat and LLM-powered tools will return an error. Add it to server/.env.");
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
