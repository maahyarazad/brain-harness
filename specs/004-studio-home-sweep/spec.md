# Feature Specification: Studio as the Home Page, Animated Sweeps Everywhere, and a Way Back from My Visualizations

**Feature Branch**: `004-studio-home-sweep`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "in the UI the initial landing page should be Visualization Studio and remove the Playground from landing page, but keep the code. Times-table circle has a nice Animated Sweep in the Presets, so add this feature for all the visualizations - when I am in studio?view=mine there is no back buttton - fix that one as well"

## Clarifications

### Session 2026-11-12

- Q: Should the Playground still open at an unlinked address such as /playground? → A: Yes. It is not linked anywhere, but /playground still opens it for developers.
- Q: Should each visualization get one hand-picked sweep preset, or should every slider also get its own sweep switch? → A: One hand-picked "Animated sweep" preset per visualization. There is no per-slider sweep switch.
- Q: When someone opens the root address, should the address stay "/" or change to "/studio"? → A: It changes to /studio, so the catalog has a single address.
- Q: Should visualizations that run once and finish (sorting, maze, Langton's ant, 1-D automaton) start a new run with the next setting when a run finishes? → A: Yes. When a run finishes, the sweep applies the next setting and starts a new run.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The site opens on the Visualization Studio (Priority: P1)

A visitor opens the site's address and lands straight in the Visualization Studio catalog, and the address changes to the studio's own address (/studio). The Playground (the chat page for the MCP server) is no longer shown on the landing page or in the navigation. Its code stays in the project, and developers can still open it at the unlinked address /playground.

**Why this priority**: This is the first thing every visitor sees. It decides what the site is about, and it is the smallest change with the widest reach.

**Independent Test**: Open the site's root address in a fresh browser. The studio catalog appears, with no Playground link, tab or panel anywhere on the page.

**Acceptance Scenarios**:

1. **Given** a visitor with no history on the site, **When** they open the root address, **Then** they see the Visualization Studio catalog and the address bar shows /studio, without an extra entry in the browser history.
2. **Given** the visitor is anywhere in the studio, **When** they look at the page, **Then** there is no link, tab or button leading to the Playground.
3. **Given** someone has an older studio link (a visualization, a saved visualization, a share link, or a filtered catalog), **When** they open it, **Then** it opens exactly as before.
4. **Given** the project's source, **When** a developer looks for the Playground, **Then** its code and its tests are still present and the tests still pass.
5. **Given** a developer types /playground, **When** the page loads, **Then** the Playground opens and works as before, with no link back to it from the studio needed.
6. **Given** the visitor opens the root address, **When** the page loads, **Then** the browser tab title names the Visualization Studio.

---

### User Story 2 - Get back from "My visualizations" (Priority: P1)

A user opens "My visualizations" (the page listing what they saved in this browser). The page has a clear "Back to catalog" control, like the one on a visualization's page, that returns them to the catalog.

**Why this priority**: Today the page is a dead end apart from the browser's back button and the title link, which users don't recognize as navigation. It is a small, obvious fix.

**Independent Test**: Open "My visualizations" from the header, or by typing its address directly. Use the back control and confirm the catalog appears.

**Acceptance Scenarios**:

1. **Given** the user is on "My visualizations", **When** they look at the page, **Then** a visible back control labelled to say where it goes (the catalog) is at the top of the page, in the same place as on a visualization's page.
2. **Given** the user is on "My visualizations", **When** they activate the back control (by mouse, touch or keyboard), **Then** the catalog appears.
3. **Given** the user opened "My visualizations" directly from a bookmarked or typed address (so there is no earlier page in the history), **When** they use the back control, **Then** they still land on the catalog.
4. **Given** the user has no saved visualizations, **When** they open "My visualizations", **Then** both the empty-state message and the back control are shown.
5. **Given** the user went catalog → My visualizations → back control, **When** they then press the browser's back button, **Then** they return to "My visualizations". The back control behaves like an ordinary link.

---

### User Story 3 - An "Animated sweep" preset on every visualization (Priority: P2)

The Times-table circle has an "Animated sweep" preset: picking it slowly and continuously changes the multiplier, so the drawing morphs from one shape into the next. Every visualization in the studio gets a preset of the same name that does the same thing for that visualization: it slowly moves one or more of its settings through an interesting range, so the user can sit back and watch the picture change.

**Why this priority**: It makes every visualization come alive with one click and is the most fun part of this request. It is also the largest piece of work (23 visualizations), and the other two stories don't depend on it.

**Independent Test**: For each visualization, open it, pick "Animated sweep" from the presets, and watch for 30 seconds. The picture keeps changing smoothly, the swept setting's control moves with it, and playback controls can pause and resume the sweep.

**Acceptance Scenarios**:

1. **Given** any visualization in the catalog, **When** the user opens its presets, **Then** an "Animated sweep" preset is listed.
2. **Given** the user picks "Animated sweep", **When** the visualization runs, **Then** the swept settings change gradually and continuously. The picture changes visibly at least every few seconds and never jumps abruptly.
3. **Given** a sweep is running, **When** the swept setting reaches the end of its range, **Then** the sweep either reverses or continues in a way that has no visible jump (for example, an angle that wraps around a full turn).
4. **Given** a sweep is running, **When** the user presses pause, **Then** the sweep stops where it is; **When** they press play, **Then** it continues from there.
5. **Given** a sweep is running, **When** the user looks at the knob panel, **Then** they can see which setting is being swept and its current value, and they can change the sweep speed.
6. **Given** a sweep is running, **When** the user drags the swept setting's control themselves, **Then** the sweep continues from the value they set.
7. **Given** the user has chosen "Reduce" motion (or the system asks for reduced motion under "System"), **When** they pick "Animated sweep", **Then** the visualization starts paused, as other animations do, and starts sweeping when they press play.
8. **Given** a sweep is running, **When** the user saves, shares, or exports the visualization, **Then** opening the result starts the same sweep with the same speed.
9. **Given** a visualization whose picture takes noticeable time to draw (for example the Mandelbrot set or diffusion-limited aggregation), **When** its sweep runs, **Then** the sweep is slow enough that each new picture is finished and visible before the next change, and the page stays responsive.
10. **Given** the Times-table circle, **When** the user picks its existing "Animated sweep" preset, **Then** it behaves as it does today.

---

### Edge Cases

- **Old Playground bookmark**: the root address used to be the Playground, so an old bookmark to it now opens the studio catalog at /studio. No error page and no broken page are shown.
- **Single catalog address**: the root address redirects to /studio, so the catalog has one address. Links inside the studio keep using studio addresses, so existing share links stay valid.
- **Unknown addresses**: an address that is neither a studio page nor /playground opens the studio catalog, as unknown studio paths do today.
- **Sweep and simulations**: for visualizations that run continuously (flocking, Game of Life, double pendulum, Lorenz and similar), the sweep changes a setting while the simulation runs and does not restart it.
- **Sweep and finite runs**: for visualizations whose run finishes (sorting, maze, Langton's ant, 1-D cellular automaton), the sweep waits until the current run finishes, then applies the next setting and starts a new run. The finished picture stays on screen until the new run begins.
- **Sweep and random visualizations**: a sweep on a visualization with randomness uses the same seed throughout, so the picture changes because of the swept setting, not because of new random numbers.
- **Settings that can't change while running**: if the most interesting setting can only take effect by redrawing from scratch, the sweep may step it at a slower pace. Each step must still look like a continuation, not a reset to a blank canvas.
- **Leaving the page**: a sweep stops using resources when the user leaves the visualization, switches tabs, or the studio is hidden, and resumes when they return, as other animations do.
- **Recording a sweep**: the "Record video" button is offered for sweeps on visualizations that otherwise have none (for example a static fractal), because the sweep makes them animated.
- **Old saved files**: saved visualizations, share links and exported files made before this feature still open unchanged and do not start sweeping.

## Requirements *(mandatory)*

### Functional Requirements

**Landing page**

- **FR-001**: The site's root address MUST show the Visualization Studio catalog by replacing the address with /studio, without adding a browser history entry.
- **FR-002**: The Playground MUST NOT appear anywhere in the studio interface: no navigation link, tab, panel or button leads to it.
- **FR-003**: The Playground's code and tests MUST stay in the project and keep passing, and the Playground MUST still open, fully working, at the unlinked address /playground.
- **FR-004**: Every existing studio address (catalog with search or category filters, a visualization, a saved visualization, a share link, "My visualizations") MUST keep working unchanged.
- **FR-005**: The site's top navigation MUST NOT show a section switcher with a single entry. If only the studio remains, the switcher is removed.
- **FR-006**: Opening any studio page MUST NOT load or start the Playground (no connection to the MCP server, no request for an API key). The Playground loads only when /playground is opened.

**Back from "My visualizations"**

- **FR-007**: The "My visualizations" page MUST show a back control at the top, labelled to say it goes to the catalog, styled and placed like the back control on a visualization's page.
- **FR-008**: The back control MUST take the user to the catalog whether they reached the page from the catalog, from a visualization, or by opening its address directly.
- **FR-009**: The back control MUST be reachable and usable by keyboard and announced to screen readers as a link or button with its label.

**Animated sweep**

- **FR-010**: Every visualization in the catalog (all 23) MUST offer a preset named "Animated sweep".
- **FR-011**: Picking "Animated sweep" MUST start an animation that gradually changes one or more of that visualization's settings, chosen per visualization so the change is clearly visible and pleasing (Appendix A lists a starting choice for each).
- **FR-012**: The sweep MUST be smooth: no visible jump at the ends of the range (it reverses, or it wraps only where the setting is circular), and no blank frame between steps.
- **FR-013**: The knob panel MUST show the sweep as active, show the swept setting's current value as it changes, and let the user turn the sweep off and change its speed.
- **FR-014**: The sweep MUST be governed by the same play/pause, reduced-motion, hidden-tab and leave-page rules as the studio's existing animations.
- **FR-015**: A running sweep MUST be part of the visualization's settings, so saving, sharing, exporting and importing preserve it (whether it is on, which setting, its range and its speed).
- **FR-016**: Saved visualizations, share links and exported files created before this feature MUST open exactly as before, with no sweep.
- **FR-017**: The Times-table circle's existing "Animated sweep" preset MUST keep its current look and speed.
- **FR-018**: While sweeping, a visualization MUST keep the page responsive: the user can pause, change knobs, or leave at any time without waiting for a frame to finish.
- **FR-019**: A visualization that is sweeping MUST offer "Record video" whenever the browser supports recording, even if that visualization is otherwise still.
- **FR-020**: For visualizations whose run finishes (sorting, maze, Langton's ant, 1-D cellular automaton), the sweep MUST apply its next setting only after the current run finishes, then start a new run. Continuously running simulations MUST be swept without restarting.
- **FR-021**: The sweep is offered only as each visualization's hand-picked "Animated sweep" preset. A per-slider sweep switch is out of scope.

### Key Entities

- **Sweep**: an animation of one or more settings of a visualization. Has the settings it moves, the range for each, a speed, and how it handles the end of the range (reverse, or wrap for circular settings). It is on or off, and is saved with the rest of the visualization's settings.
- **Preset** (existing): a named set of setting values for one visualization. "Animated sweep" is a preset whose values turn a sweep on.
- **Visualization** (existing): gains a declared default sweep (which settings, range and speed), used by its "Animated sweep" preset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of first visits to the root address show the studio catalog. No Playground element is visible on any studio page.
- **SC-002**: All existing studio links (catalog filters, visualization, saved, share, "My visualizations") from before the change open the same content afterwards, with zero broken links in a check of every link form.
- **SC-003**: From "My visualizations", users get back to the catalog in one action, including when the page was opened directly.
- **SC-004**: All 23 visualizations list an "Animated sweep" preset, and in a 30-second watch of each, the picture changes visibly at least once every 5 seconds with no abrupt jump or blank frame.
- **SC-005**: During any sweep, pause takes effect within a quarter of a second and the user can change any knob without the page freezing.
- **SC-006**: A sweep saved, shared or exported and then reopened starts the same sweep at the same speed, for every visualization.
- **SC-007**: The Playground's existing automated tests all still pass.

## Assumptions

- **Where the Playground lives now**: "Remove the Playground from the landing page" is read as "remove it from the interface", not "delete it". It is no longer linked from anywhere, its code and tests stay, and it still opens at /playground for developers (clarified).
- **Root address**: the root address redirects to /studio (clarified). Studio pages keep their current addresses so existing share links stay valid.
- **"Back" target**: the back control on "My visualizations" goes to the catalog, matching the existing "Back to catalog" on visualization pages. It does not mean "browser history back", which already works.
- **What "this feature for all the visualizations" means**: each visualization gets its own "Animated sweep" preset with a hand-picked setting and range (Appendix A), built on one shared sweep mechanism. A per-slider sweep switch is out of scope (clarified).
- **Range ends**: by default a sweep goes back and forth between the ends of its range. Circular settings (angles, the times-table multiplier) may wrap around.
- **Heavy visualizations**: the Mandelbrot and Julia sets, diffusion-limited aggregation and similar sweep slowly enough to finish each picture. Their sweep may be a slow zoom or a slow change of a shape parameter rather than the fastest-changing setting.
- **Stability**: no new server or account features are needed; everything stays in the browser, as with the rest of the studio.

## Appendix A — Starting choice of sweep per visualization

A starting point for planning. The settings as built are in [research.md R8](./research.md), which replaces this table where they differ (Ulam, Game of Life, Double pendulum, Voronoi).

| Visualization | Swept setting(s) | Notes |
|---|---|---|
| Times-table circle | multiplier m | Existing preset, unchanged |
| Ulam spiral | highlighted pattern / spacing parameter | Slow pulse |
| Recamán sequence | number of terms shown | Grows and shrinks |
| Pascal's triangle mod n | modulus n | Steps through moduli |
| Collatz coral | turning angles | Coral sways |
| Phyllotaxis | divergence angle around the golden angle | Spirals appear and dissolve |
| Mandelbrot set | slow zoom toward a well-known point and back | Uses the existing smooth zoom |
| Julia set | c moving around a circle | Shape morphs continuously |
| Chaos game | jump ratio | Fractal tightens and loosens |
| L-system | turning angle | Plant/curve bends |
| Barnsley fern | one transform's weight / shape | Fern leans and grows |
| Game of Life | birth/survival rule or speed | Simulation keeps running |
| Elementary cellular automaton | rule number, stepping | New run after each run finishes |
| Reaction–diffusion | feed and kill rates along a path | Patterns morph |
| Diffusion-limited aggregation | sticking probability | Slow, one cluster at a time |
| Langton's ant | turn rule (cycled) | New run after each run finishes |
| Flocking (boids) | alignment / cohesion weights | Flock tightens and scatters |
| Double pendulum | starting angle offset | Simulation keeps running |
| Lorenz attractor | ρ (rho) | Butterfly reshapes |
| Fourier epicycles | number of terms | Drawing sharpens and blurs |
| Sorting algorithms | algorithm (cycled), then array size | New run after each sort finishes |
| Maze generation | grid size | New run after each maze finishes |
| Voronoi / Delaunay | point drift | Cells shift and flow |
