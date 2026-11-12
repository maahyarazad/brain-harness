// Site routes (specs/004-studio-home-sweep/contracts/routes.md): the studio is the
// home page, the Playground is unlinked at /playground, and "My visualizations"
// has a way back to the catalog.
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import Root from "../../Root.jsx";
import { createSaved } from "../../studio/core/storage.js";
import { installCanvasStub } from "./canvasStub.js";

const appLoaded = vi.fn();
vi.mock("../../App.jsx", () => {
  appLoaded();
  return { default: () => <h1>Brain Harness playground</h1> };
});

installCanvasStub();

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function openAt(path) {
  window.history.replaceState(null, "", path);
  render(<Root />);
  return userEvent.setup();
}

const catalogHeading = () => screen.findByRole("heading", { name: "Number patterns" });

// ---- US1: the studio is the home page ----

test("the root address shows the catalog at /studio without adding a history entry", async () => {
  const before = window.history.length;
  openAt("/?category=fractals");
  expect(await screen.findByRole("heading", { name: "Fractals" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/studio");
  expect(window.location.search).toBe("?category=fractals");
  expect(window.history.length).toBe(before);
  expect(document.title).toBe("Visualization Studio · Brain Harness");
});

test("an unknown address shows the catalog at /studio", async () => {
  openAt("/garbage/path");
  expect(await catalogHeading()).toBeInTheDocument();
  expect(window.location.pathname).toBe("/studio");
});

test.each(["/studio", "/studio/phyllotaxis", "/studio?view=mine"])(
  "no Playground link or text on %s",
  async (path) => {
    openAt(path);
    await screen.findAllByRole("heading");
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/playground/i)).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/playground"]')).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  }
);

test("studio pages never load the Playground", async () => {
  openAt("/studio");
  await catalogHeading();
  expect(appLoaded).not.toHaveBeenCalled();
});

test("/playground still opens the Playground", async () => {
  openAt("/playground");
  expect(await screen.findByRole("heading", { name: "Brain Harness playground" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/playground");
  expect(document.title).toBe("Brain Harness");
});

test("older studio links still open what they did", async () => {
  openAt("/studio?category=fractals");
  expect(await screen.findByRole("heading", { name: "Fractals" })).toBeInTheDocument();
  expect(window.location.search).toBe("?category=fractals");
});

test("opening /studio/times-table directly shows that visualization", async () => {
  openAt("/studio/times-table");
  expect(await screen.findByRole("heading", { name: "Times-table circle" })).toBeInTheDocument();
  expect(await screen.findByLabelText("Multiplier m")).toBeInTheDocument();
});

test("a saved visualization link still opens", async () => {
  const { record } = createSaved({ name: "My spiral", config: { vizId: "phyllotaxis", values: { spacing: 9 }, seed: 0, view: null, input: null, presetId: null } });
  openAt(`/studio/saved/${record.id}`);
  expect(await screen.findByRole("heading", { name: /My spiral/ })).toBeInTheDocument();
});

test("an unknown visualization shows the catalog with a message", async () => {
  openAt("/studio/not-a-thing");
  expect(await screen.findByText(/doesn't exist/)).toBeInTheDocument();
});

test("browser back returns to the previous studio page", async () => {
  const user = openAt("/studio");
  await catalogHeading();
  await user.click(screen.getByRole("link", { name: "My visualizations" }));
  expect(window.location.search).toBe("?view=mine");
  act(() => {
    window.history.replaceState(null, "", "/studio");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(await catalogHeading()).toBeInTheDocument();
});

// ---- US2: back from My visualizations ----

const backLink = () => screen.findByRole("link", { name: "Back to catalog" });

test("My visualizations has a back link to the catalog, even when empty", async () => {
  openAt("/studio?view=mine");
  const link = await backLink();
  expect(link).toHaveAttribute("href", "/studio");
  expect(screen.getByText("Nothing saved yet.")).toBeInTheDocument();
});

test("the back link is shown with saved items too", async () => {
  createSaved({ name: "Mine", config: { vizId: "phyllotaxis", values: {}, seed: 0, view: null, input: null, presetId: null } });
  openAt("/studio?view=mine");
  expect(await backLink()).toBeInTheDocument();
  expect(screen.getByText("Mine")).toBeInTheDocument();
});

test("the back link goes to the catalog and pushes a history entry", async () => {
  const user = openAt("/studio?view=mine");
  const before = window.history.length;
  await user.click(await backLink());
  expect(await catalogHeading()).toBeInTheDocument();
  expect(window.location.pathname).toBe("/studio");
  expect(window.location.search).toBe("");
  expect(window.history.length).toBe(before + 1);
});

test("the back link works from the keyboard", async () => {
  const user = openAt("/studio?view=mine");
  const link = await backLink();
  link.focus();
  await user.keyboard("{Enter}");
  expect(await catalogHeading()).toBeInTheDocument();
});

test("a modified click on the back link is left to the browser", async () => {
  openAt("/studio?view=mine");
  const link = await backLink();
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  act(() => link.dispatchEvent(ev));
  expect(ev.defaultPrevented).toBe(false);
  expect(window.location.search).toBe("?view=mine");
});

// ---- US4: the development-only picture generator ----

vi.mock("../../studio/dev/ThumbnailStudio.jsx", () => ({ default: () => <h1>Catalog pictures</h1> }));

test("/studio/__thumbnails opens the picture generator in development", async () => {
  expect(import.meta.env.DEV).toBe(true);
  openAt("/studio/__thumbnails");
  expect(await screen.findByRole("heading", { name: "Catalog pictures" })).toBeInTheDocument();
});
