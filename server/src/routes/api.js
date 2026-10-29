import { runChat } from "../chat/runChat.js";
import { listCapabilities, runPrompt, runTool } from "../capabilities.js";

const argumentsBody = {
  type: "object",
  properties: {
    arguments: { type: "object", default: {} },
  },
};

// Playground API (see specs/001-brain-harness-test-ui/contracts/http-api.md).
// Mounted under /api by app.js.
export default async function apiRoutes(app) {
  app.post(
    "/chat",
    {
      schema: {
        body: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
            history: { type: "array", items: { type: "object" }, default: [] },
          },
        },
      },
    },
    async (request) => runChat(request.body)
  );

  app.get("/capabilities", async () => listCapabilities());

  app.post("/tools/:name", { schema: { body: argumentsBody } }, async (request) =>
    runTool(request.params.name, request.body?.arguments ?? {})
  );

  app.post("/prompts/:name", { schema: { body: argumentsBody } }, async (request) =>
    runPrompt(request.params.name, request.body?.arguments ?? {})
  );
}
