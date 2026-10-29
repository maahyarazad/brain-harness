// Health check (handy for load balancers / uptime monitors, and the
// playground's Online/Offline indicator)
export default async function healthRoutes(app) {
  app.get("/health", async () => ({ status: "ok" }));
}
