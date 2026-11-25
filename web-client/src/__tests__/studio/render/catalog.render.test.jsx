// T3 and T4: typing in the search box, or switching the category filter, redraws only the cards whose
// visibility changed (Story 6 scenario 3).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach } from "vitest";
import Root from "../../../Root.jsx";
import CatalogCard from "../../../studio/components/CatalogCard.jsx";
import { installCanvasStub } from "../canvasStub.js";
import { stubReducedMotion } from "../browserStubs.js";
import { instrument } from "../../helpers/renderProbe.jsx";

vi.mock("../../../api.js", () => ({
  getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  getCapabilities: vi.fn().mockResolvedValue({ tools: [], prompts: [] }),
  sendChat: vi.fn(),
  runTool: vi.fn(),
  runPrompt: vi.fn(),
}));

installCanvasStub();

let probe;
beforeEach(() => {
  localStorage.clear();
  stubReducedMotion(false);
});
afterEach(() => probe?.restore());

async function openCatalog() {
  probe = instrument(CatalogCard, { keyOf: (p) => p.entry.id });
  window.history.replaceState(null, "", "/studio");
  render(<Root />);
  await screen.findByRole("heading", { name: "Number patterns" });
  probe.reset();
  return userEvent.setup();
}
const visible = () => screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/studio/") && !a.getAttribute("href").includes("saved/"));

test("typing in the search box does not redraw the cards that stay visible", async () => {
  const user = await openCatalog();
  const box = screen.getByPlaceholderText("Search visualizations");
  const before = visible().length;
  await user.type(box, "m"); // many cards match "m"
  const afterM = visible().map((a) => a.getAttribute("href").replace("/studio/", ""));
  expect(afterM.length).toBeLessThan(before);
  expect(afterM.length).toBeGreaterThan(3);
  probe.reset();
  await user.type(box, "a"); // "ma": a few of those leave, the rest stay
  const afterMa = visible().map((a) => a.getAttribute("href").replace("/studio/", ""));
  const stayed = afterMa.filter((id) => afterM.includes(id));
  expect(stayed.length).toBeGreaterThan(0);
  for (const id of stayed) expect(probe.count(id), `${id} stayed visible`).toBe(0);
  expect(probe.count()).toBe(0);
});

test("switching the category filter does not redraw cards that are visible both before and after", async () => {
  const user = await openCatalog();
  await user.click(screen.getByRole("button", { name: "Fractals" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Number patterns" })).toBeNull());
  probe.reset();
  await user.click(screen.getByRole("button", { name: "All" })); // Fractals stay, the rest appear
  await screen.findByRole("heading", { name: "Number patterns" });
  for (const id of ["mandelbrot", "julia", "chaos-game", "l-system", "barnsley-fern"]) {
    expect(probe.count(id), `${id} was visible before and after`).toBe(0);
  }
  expect(probe.count("collatz-coral")).toBeGreaterThan(0); // the new ones were drawn
});
