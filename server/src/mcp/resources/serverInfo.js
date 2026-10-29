// Resource module: data an MCP client can read.

export const name = "server-info";

export const uri = "info://server";

export const config = {
  title: "Server info",
  description: "Basic information about this MCP server",
  mimeType: "application/json",
};

export async function handler(uri) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            name: "brain-harness",
            runtime: process.version,
            uptimeSeconds: Math.round(process.uptime()),
          },
          null,
          2
        ),
      },
    ],
  };
}
