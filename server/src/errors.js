import Anthropic from "@anthropic-ai/sdk";

/** An error we expect and want to show the playground user as-is. */
export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Turn any error into the `{ error: { code, message } }` envelope from
 * contracts/http-api.md. Most specific error classes are checked first.
 */
export function toErrorEnvelope(err) {
  let statusCode = 500;
  let code = "internal_error";
  let message = "Something went wrong on the server.";

  if (err instanceof ApiError) {
    ({ statusCode, code, message } = err);
  } else if (err instanceof Anthropic.RateLimitError) {
    statusCode = 429;
    code = "rate_limited";
    message = "Anthropic rate limit reached. Wait a moment and try again.";
  } else if (err instanceof Anthropic.APIConnectionTimeoutError) {
    statusCode = 504;
    code = "upstream_timeout";
    message = "Claude took too long to answer. Try again.";
  } else if (err instanceof Anthropic.AuthenticationError) {
    statusCode = 502;
    code = "upstream_error";
    message = "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in server/.env.";
  } else if (err instanceof Anthropic.APIError) {
    statusCode = 502;
    code = "upstream_error";
    message = err.message;
  } else if (err?.validation) {
    // Fastify request-schema validation failure
    statusCode = 400;
    code = "invalid_request";
    message = err.message;
  }

  return { statusCode, body: { error: { code, message } } };
}
