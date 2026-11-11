# Feature Specification: Visualization Studio

**Feature Branch**: `003-visualization-studio`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Keep the current UI but separate it from the client, and add a complete set of visualization UIs for these choices: Ulam spiral, Recamán's sequence, times-table circle, Pascal's triangle mod n, Mandelbrot/Julia sets, chaos game, L-systems, Barnsley fern, Game of Life and elementary cellular automata, Gray–Scott reaction–diffusion, boids, Langton's ant, diffusion-limited aggregation, Lorenz attractor, double pendulum, Voronoi/Delaunay, Fourier epicycles, phyllotaxis, sorting algorithms, and maze generation and pathfinding. Users can switch between them, change the configuration with knobs and sliders, and create their own visualizations."

## Overview

The web client gains a **Visualization Studio**: a gallery of 23 generative and algorithmic visualizations: the 20 topics listed above (with Mandelbrot/Julia and Game of Life/elementary automata as separate entries) plus the Collatz coral that inspired the list. Each one draws a picture from a simple rule, and its settings show up as knobs (sliders, dropdowns, toggles, text fields). Users browse the catalog, open a visualization, adjust its knobs and watch it update, then save the result as their own named visualization.

The existing Brain Harness playground (prompt composer, conversation, capability panel, voice input) stays as it is. The studio is a separate section of the client: it does not change the playground's behavior and does not depend on the MCP server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and run a visualization (Priority: P1)

A user opens the client, goes to the Visualization Studio, sees the catalog grouped into five categories (Number patterns, Fractals, Simulation and emergence, Geometry and dynamics, Algorithm visualizations), picks one, and sees it drawn with its default settings.

**Why this priority**: Without the catalog and a working canvas there is nothing else to do. One working visualization is already a usable demo.

**Independent Test**: Open the studio, pick any visualization, and confirm a recognizable picture appears with defaults (for example, the times-table circle with multiplier 2 shows a cardioid).

**Acceptance Scenarios**:

1. **Given** the client is open, **When** the user chooses the Visualization Studio, **Then** they see every catalog entry grouped by category, each with its name, a preview thumbnail, and a one-line description.
2. **Given** the catalog is shown, **When** the user selects a visualization, **Then** it is drawn with default settings and its knobs appear next to it.
3. **Given** a visualization is showing, **When** the user selects a different one, **Then** the previous one stops (including any animation) and the new one starts without reloading the page.
4. **Given** the user is in the studio, **When** they go back to the playground, **Then** the playground works exactly as before, including any conversation already in progress.

---

### User Story 2 - Tune a visualization with knobs (Priority: P1)

A user changes a visualization's knobs and the picture updates right away, so they can explore how small changes give very different results.

**Why this priority**: The knobs are the point of the feature. Exploring "what happens if I nudge this" is the core experience.

**Independent Test**: In phyllotaxis, move the angle from 137.5° to 137.6° and confirm the spiral visibly breaks apart. In Gray–Scott, change feed and kill rate and confirm the pattern type changes.

**Acceptance Scenarios**:

1. **Given** a visualization is showing, **When** the user moves a knob, **Then** the picture updates to reflect the new value, and the knob shows its current value as a number or label.
2. **Given** a knob has a valid range, **When** the user types a value outside that range, **Then** the value is clamped to the nearest limit and the user sees why.
3. **Given** an animated visualization (simulation, sort, pendulum, epicycles, etc.), **When** the user uses the playback controls, **Then** they can play, pause, step one frame, change speed, and reset.
4. **Given** knobs have been changed, **When** the user chooses "Reset to defaults", **Then** every knob returns to its default and the picture redraws.
5. **Given** a visualization supports randomness, **When** the user sets a seed, **Then** the same seed and settings always produce the same picture; a "Randomize seed" action picks a new one.
6. **Given** a visualization offers built-in presets (for example Rule 30 / Rule 110, Koch curve / dragon curve / plant, Sierpiński / fern / snowflake), **When** the user picks a preset, **Then** the knobs are set to that preset's values.

---

### User Story 3 - Save my own visualization (Priority: P2)

A user who has found a setting they like saves it under a name, then reopens it later from a "My visualizations" list, edits it, duplicates it, or deletes it.

**Why this priority**: This is the "create your own visualization" part of the request. It builds on Stories 1 and 2.

**Independent Test**: Tune the Mandelbrot set to a zoomed-in region with a custom palette, save it as "Seahorse valley", reload the page, and open it from My visualizations with the same view.

**Acceptance Scenarios**:

1. **Given** a visualization with changed knobs, **When** the user saves it with a name, **Then** it appears in My visualizations with a thumbnail, its name, the base algorithm, and the date saved.
2. **Given** a saved visualization, **When** the user opens it, **Then** the base algorithm opens with every knob, seed, and preset set as saved and the same picture is drawn.
3. **Given** a saved visualization, **When** the user renames, duplicates, overwrites, or deletes it, **Then** My visualizations reflects the change; deleting asks for confirmation first.
4. **Given** the user closes and reopens the browser, **When** they open the studio, **Then** their saved visualizations are still there.

---

### User Story 4 - Share and export (Priority: P3)

A user copies a link that opens the studio on the same visualization with the same settings, or downloads the current picture as an image.

**Why this priority**: Useful for showing results to others, but not needed to explore or save.

**Independent Test**: Copy the link for a tuned Ulam spiral, open it in a private window, and confirm the same picture appears. Download the image and confirm it matches the canvas.

**Acceptance Scenarios**:

1. **Given** any visualization, **When** the user copies its share link and opens it elsewhere, **Then** the same algorithm opens with the same settings and seed.
2. **Given** any visualization, **When** the user downloads it, **Then** they get an image file of the current frame.
3. **Given** a saved visualization, **When** the user exports it, **Then** they get a settings file that can be imported on another browser to recreate it.

---

### Edge Cases

- A share link or imported file names an unknown algorithm or has missing or invalid values: the studio opens what it can, falls back to defaults for bad values, and tells the user which values were replaced.
- Heavy settings (Mandelbrot at a very high iteration limit, maximum particle counts, the largest grids): the page stays responsive, the picture draws progressively with a visible progress indicator, and the user can change a knob or switch away at any time.
- Deep zoom in Mandelbrot/Julia reaches the limit of numeric precision: the user is told the zoom limit was reached instead of seeing a blocky image without explanation.
- L-system rules that grow too fast (for example a high recursion depth): the depth is capped so the drawing stays within a safe size, and the user is told why.
- L-system rule text that can't be parsed: the error is shown next to the field, and the last valid drawing stays on screen.
- Langton's ant turn rule with characters other than L and R, or an empty rule: rejected with an inline message.
- Diffusion-limited aggregation walkers that never stick (stickiness near 0): the run has a step budget and stops with a message instead of running forever.
- Maze with no path (not possible with the listed generators, but possible with an edited grid): the solver reports "no path".
- Browser storage is full or blocked (private mode): saving fails with a clear message and the user can still export the settings file.
- Window resized or phone held sideways: the canvas resizes and redraws without losing settings.
- Switching visualizations mid-animation: the old animation stops completely and does not keep using the processor in the background.
- The browser tab is hidden: animations pause and resume when the tab is shown again.

## Requirements *(mandatory)*

### Functional Requirements

**Separation from the existing playground**

- **FR-001**: The client MUST keep the existing playground with no change to its behavior, layout, or tests.
- **FR-002**: The client MUST offer a clear way (for example top-level navigation) to switch between the playground and the Visualization Studio, and each MUST have its own address so it can be bookmarked.
- **FR-003**: The Visualization Studio MUST work without the MCP server being reachable and without an API key.

**Catalog and navigation**

- **FR-004**: The studio MUST list every visualization in the catalog below, grouped by category, with a name, a thumbnail, and a one-line description of the rule.
- **FR-005**: Users MUST be able to search or filter the catalog by name and category.
- **FR-006**: Each visualization MUST show a short "How it works" explanation of its rule next to the canvas.

**Knobs and playback**

- **FR-007**: Every visualization MUST expose at least the knobs listed for it in the catalog below, each with a label, a default, a valid range or set of options, and the current value shown.
- **FR-008**: Knob changes MUST update the picture without a page reload; for static pictures the update MUST start within 0.2 seconds of the change.
- **FR-009**: Animated visualizations MUST provide play, pause, single step, speed, and reset controls.
- **FR-010**: Every visualization MUST provide "Reset to defaults".
- **FR-011**: Every visualization that uses randomness MUST accept a seed and produce the same output for the same seed and settings.
- **FR-012**: Visualizations listed with presets MUST offer them as a one-click choice that sets the knobs.
- **FR-013**: Knob values outside the allowed range MUST be clamped or rejected with a visible message; invalid text input (rules, turn strings) MUST show an inline error and keep the last valid picture.
- **FR-014**: Visualizations listed with a color palette knob MUST offer at least 4 palettes, including at least one that is safe for common color blindness.
- **FR-015**: Visualizations listed as "interactive" MUST accept pointer input on the canvas (for example pan and zoom for Mandelbrot/Julia, placing seed points for Voronoi, drawing cells for Game of Life, drawing walls and moving start/end for mazes, drawing an outline for Fourier epicycles).

**Saving my own visualizations**

- **FR-016**: Users MUST be able to save the current visualization (algorithm, all knob values, seed, preset, and view such as zoom and pan) under a name they choose.
- **FR-017**: Users MUST be able to list, open, rename, duplicate, overwrite, and delete saved visualizations; delete MUST ask for confirmation.
- **FR-018**: Saved visualizations MUST survive a page reload and browser restart on the same browser.
- **FR-019**: Opening a saved visualization MUST reproduce the same picture it had when saved (same frame for static pictures; same starting state for animations).

**Sharing and export**

- **FR-020**: Users MUST be able to copy a link that encodes the algorithm and its settings, so opening it recreates the visualization.
- **FR-021**: Users MUST be able to download the current frame as an image.
- **FR-022**: Users MUST be able to export a saved visualization to a settings file and import such a file; invalid values in a link or file MUST fall back to defaults with a message listing what was replaced.

**Responsiveness and access**

- **FR-023**: Heavy computations MUST NOT freeze the page: knobs, playback, and navigation MUST stay usable while a picture is being computed, and a progress indicator MUST show for anything that takes over 1 second.
- **FR-024**: Animations MUST stop when the user leaves a visualization and pause when the tab is hidden.
- **FR-025**: Every knob and control MUST be usable with the keyboard alone and have an accessible name.
- **FR-026**: The studio MUST work on desktop and phone-width screens; on narrow screens the knobs panel MAY collapse below or beside the canvas.
- **FR-027**: The studio MUST offer a reduced-motion setting, on by default when the operating system asks for reduced motion, that starts animations paused.

### Visualization Catalog and Required Knobs

Every entry includes the shared controls from FR-009 to FR-011 where they apply (playback for animated entries, seed for random ones).

**Number patterns**

| # | Visualization | Rule | Required knobs | Presets / interactive |
|---|---|---|---|---|
| V01 | Collatz coral | Trace each number's Collatz path backwards from 1, turning one way on even steps and the other on odd steps | count of starting numbers, even-step angle, odd-step angle, segment length, palette | — |
| V02 | Ulam spiral | Write integers in a spiral and mark the primes | starting number, spiral shape (square, hexagonal, Sacks), size (count of numbers), dot size, palette | interactive: hover shows the number |
| V03 | Recamán's sequence | Go back n if the result is positive and unused, else forward n | number of terms, arc style (semicircle, ellipse, alternating above/below), palette | animated build-up |
| V04 | Times-table circle | Connect point k to k × m mod N on a circle of N points | multiplier m (decimal allowed), point count N, animate m on/off with rate, line opacity, palette | presets: cardioid (m=2), nephroid (m=3) |
| V05 | Pascal's triangle mod n | Color each entry by its remainder mod n | modulus n, number of rows, palette | preset: Sierpiński (mod 2) |

**Fractals**

| # | Visualization | Rule | Required knobs | Presets / interactive |
|---|---|---|---|---|
| V06 | Mandelbrot set | Iterate z → z² + c per point; color by escape speed | zoom, center, iteration limit, palette, smooth coloring on/off | interactive: pan, zoom, click to open the Julia set for that c |
| V07 | Julia set | Same, with fixed c | real and imaginary parts of c, zoom, center, iteration limit, palette | presets: well-known c values; interactive: pan, zoom |
| V08 | Chaos game | Jump a fraction of the way toward a random corner, many times | corner count, jump ratio, point count, restriction rule (none, never the same corner twice, never the neighbor of the last corner), palette | presets: Sierpiński, Vicsek-style snowflake, pentagon |
| V09 | L-system | Rewrite a string by rules, then draw it with turtle graphics | axiom, rules (editable text), angle, recursion depth, segment length, palette | presets: Koch curve, dragon curve, Hilbert curve, fractal plant |
| V10 | Barnsley fern | Pick one of four affine transforms at random, apply, repeat | weight of each of the 4 transforms, point count, palette | presets: classic fern, mutated variants |

**Simulation and emergence**

| # | Visualization | Rule | Required knobs | Presets / interactive |
|---|---|---|---|---|
| V11 | Game of Life (and life-like rules) | Cells live or die by neighbor count | birth/survival rule, grid size, starting density, speed, wrap edges on/off | presets: Conway B3/S23, HighLife, Seeds, glider gun; interactive: draw cells |
| V12 | Elementary cellular automaton | 1-D cells; next row from each 3-cell neighborhood | rule number 0–255, width, start (single cell or random with density), speed | presets: Rule 30, 90, 110, 184 |
| V13 | Reaction–diffusion (Gray–Scott) | Two chemicals react and spread | feed rate, kill rate, diffusion rates, speed, palette | presets: spots, stripes, coral, mitosis; interactive: paint chemical |
| V14 | Boids | Separation, alignment, cohesion | count, weight of each rule, view radius, max speed | interactive: pointer attracts or repels |
| V15 | Langton's ant | Turn by the color of the current cell, flip it, move | turn rule (string of L/R, e.g. RLLR), number of ants, grid size, speed | presets: classic RL, RLLR, LLRR; shows step counter |
| V16 | Diffusion-limited aggregation | Random walkers stick when they touch the cluster | particle count, stickiness, seed shape (point, line, circle), palette | — |

**Geometry and dynamics**

| # | Visualization | Rule | Required knobs | Presets / interactive |
|---|---|---|---|---|
| V17 | Lorenz attractor | Integrate the Lorenz equations | σ, ρ, β, two starting points and their separation, trail length, speed, view rotation | shows both trajectories in different colors so the drift is visible; interactive: rotate view |
| V18 | Double pendulum | Simulate two linked pendulums | both masses, both arm lengths, both starting angles, gravity, trail length | interactive: drag to set starting angles |
| V19 | Voronoi and Delaunay | Split the plane by nearest seed; connect neighbors | point count, distance metric (Euclidean, Manhattan), relaxation steps, show cells / triangulation / both, palette | interactive: add, move, remove points |
| V20 | Fourier epicycles | Chains of rotating circles redraw an outline | number of circles, shape (built-in outlines or user-drawn), speed, show circles on/off | interactive: draw a custom outline |
| V21 | Phyllotaxis | Place each point at a fixed angle from the last | angle (step 0.01° or finer), point count, spacing, dot size, palette | preset: golden angle (≈137.508°) |

**Algorithm visualizations**

| # | Visualization | Rule | Required knobs | Presets / interactive |
|---|---|---|---|---|
| V22 | Sorting algorithms | Show each comparison and swap | algorithm (bubble, insertion, selection, quick, merge, heap), array size, initial order (random, nearly sorted, reversed, few unique), display (bars, colored dots), speed | shows comparison and swap counts |
| V23 | Maze generation and pathfinding | Build a maze, then solve it | grid size, generator (depth-first search, Prim's, Wilson's), solver (A*, Dijkstra, breadth-first), heuristic for A* (Manhattan, Euclidean), speed | shows visited-cell count and path length; interactive: move start/end, draw walls |

V06 and V07, and V11 and V12, appear as separate catalog entries but may share a page with a mode switch.

### Key Entities

- **Visualization (catalog entry)**: a built-in algorithm. Has an id, name, category, description, "How it works" text, list of knob definitions, presets, and whether it is animated, random, and interactive.
- **Knob definition**: one setting. Has a label, type (number range, choice, toggle, text, color palette, point/pair), default, limits or options, step, and help text.
- **Preset**: a named set of knob values that belongs to one visualization.
- **Visualization configuration**: a full set of chosen values for one visualization: knob values, seed, view (zoom, pan, rotation), and optional user input such as drawn points or outlines.
- **Saved visualization ("My visualization")**: a configuration plus a user-given name, thumbnail, and created/updated dates. Belongs to the browser that saved it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 23 catalog entries (V01–V23) can be opened, and each shows a recognizable picture with default settings within 2 seconds on a typical laptop.
- **SC-002**: For static visualizations, a knob change shows an updated picture within 0.5 seconds at default sizes.
- **SC-003**: Animated visualizations run smoothly (at least 30 frames per second) at default settings on a typical laptop.
- **SC-004**: At the maximum allowed settings, the page never stops responding to input for more than 0.2 seconds.
- **SC-005**: 100% of saved visualizations reopen to the same picture after a browser restart (verified across all 23 entries).
- **SC-006**: A first-time user can find a visualization, change a knob, and save the result in under 1 minute without instructions.
- **SC-007**: All existing playground tests still pass, and the playground's manual checks give the same results as before.
- **SC-008**: Every knob and control in the studio can be reached and changed with the keyboard alone.

## Assumptions

- "Keep the current UI but separate it from the client" is read as: the existing Brain Harness playground stays unchanged, and the Visualization Studio is added as its own section of the same web client, independent of the playground and the server. If the intent was a separate app or removing the playground, this spec needs revising.
- The Collatz coral was named only as an example, and no Collatz visualization exists in the repo, so it is added as catalog entry V01.
- "Create your own visualization" means saving and naming custom settings of the built-in algorithms (including user-drawn input and user-written L-system rules). Writing new algorithms in code inside the app is out of scope.
- Saved visualizations are kept in the user's browser only. There are no accounts, no server storage, and no syncing between devices; export/import and share links cover moving them.
- All computation happens in the browser; the studio adds no server endpoints and makes no calls to Claude.
- "Typical laptop" means a machine from the last 5 years running a current Chrome, Edge, Firefox, or Safari.
- Out of scope for this version: video/GIF recording, a gallery shared between users, sound, and 3-D views other than the rotatable Lorenz attractor.
