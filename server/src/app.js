import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import healthRoutes from "./routes/health.js";
import mcpRoutes from "./routes/mcp.js";
import apiRoutes from "./routes/api.js";
import { toErrorEnvelope } from "./errors.js";

/** Build the Fastify app without starting it (tests use app.inject()). */
export function buildApp({ logger = true, corsOrigins = config.corsOrigins } = {}) {
  const app = Fastify({ logger });

  // Let the deployed playground call the API from another origin.
  // Same-origin setups (Vite proxy, nginx proxy) don't need this.
  if (corsOrigins.length > 0) {
    app.register(cors, { origin: corsOrigins });
  }

  app.register(healthRoutes);
  app.register(mcpRoutes);
  app.register(apiRoutes, { prefix: "/api" });

  // Every /api error leaves as { error: { code, message } }
  app.setErrorHandler((err, request, reply) => {
    const { statusCode, body } = toErrorEnvelope(err);
    if (statusCode >= 500) {
      request.log.error({ err, url: request.url }, "request failed");
    }
    reply.code(statusCode).send(body);
  });

  return app;
}
