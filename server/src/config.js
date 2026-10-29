// Runtime configuration, read once from the environment (server/.env).
// The API key itself is never exported: the Anthropic SDK reads
// ANTHROPIC_API_KEY directly, and we only need to know whether it is set.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  // Comma-separated browser origins allowed to call the API cross-origin.
  // Browsers send origins without a trailing slash, so strip any.
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
};
