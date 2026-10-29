import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";

const ORIGIN = "http://ec2-13-63-233-210.eu-north-1.compute.amazonaws.com";

test("allowed origin gets CORS headers, including preflight", async () => {
  const app = buildApp({ logger: false, corsOrigins: [ORIGIN] });

  const res = await app.inject({ method: "GET", url: "/health", headers: { origin: ORIGIN } });
  assert.equal(res.headers["access-control-allow-origin"], ORIGIN);

  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/api/chat",
    headers: {
      origin: ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], ORIGIN);
  await app.close();
});

test("other origins get no CORS headers", async () => {
  const app = buildApp({ logger: false, corsOrigins: [ORIGIN] });
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "http://evil.example" },
  });
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  await app.close();
});
