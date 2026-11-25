# Feature Specification: Navier–Stokes Fluid Simulation, a Shared Performance Layer, and a Leaner Interface

**Feature Branch**: `005-navier-stokes-fluid-performance`

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "read this website https://www.runcell.dev/tools/webgl-fluid-simulation then I need you to add the Navier-Stokes fluid simulation like this as new model in the categories - also read the blue print how to use WebGL shades like Velocity dissipation slows the motion over time and apply the optimization engine to all other and apply all the react optimization like useMemo, memo, useCallback in the project"

## Summary of the request

The request has three parts. They are separate user journeys and can be built and checked one at a time.

1. **A new visualization.** An interactive fluid simulation, a simplified Navier–Stokes model like the one on the reference page. It joins the catalog under an existing category. The visitor drags across the picture to stir colored dye through the fluid.
2. **A performance layer and a move to the graphics card for every other visualization.** The speed-versus-detail ideas that make the fluid simulation run smoothly on modest hardware are shared with the existing visualizations: quality levels with all 23, and work that adapts to the device with the 12 animated ones. In addition, each of the 12 existing animated visualizations moves onto the graphics card, as the fluid simulation does. The 11 static ones get the shared layer only.
3. **A leaner interface.** The whole project (the Visualization Studio and the Playground chat page) stops redrawing interface elements whose content has not changed. The request names the usual memoization techniques as the means.

## Clarifications

### Session 2026-11-24

- Q: When you asked to "apply the optimization engine to all other" visualizations, should that mean shared quality levels and speed-ups only, or also moving some or all of them onto the graphics card? → A: Shared quality levels and speed-ups for all existing visualizations, and every animated simulation also moves onto the graphics card (the 12 existing animated visualizations). The 11 static visualizations get the shared layer only.
- Q: For the six rule-based animated visualizations (Game of Life, Elementary cellular automaton, Langton's ant, Recamán's sequence, Sorting algorithms, Maze generation and pathfinding), must the graphics-card version produce exactly the same sequence of states as today, or is "looks the same at a glance" enough? → A: Exactly the same states, step by step, for the same settings and seed, for those six. "Looks the same at a glance" for the other six (Reaction–diffusion, Boids, Lorenz attractor, Double pendulum, Fourier epicycles, Times-table circle).
- Q: When you asked to "apply all the react optimization like useMemo, memo, useCallback in the project", should every component, computed value and handler get these techniques, or only the ones where they prevent an unneeded redraw? → A: Everywhere it can avoid a redraw. Every component that can receive unchanged inputs from a parent that redraws gets it, along with the computed values and handlers passed to those components. A written audit records each component's decision and the reason for any skip.
- Q: Should visualizations lower their own quality automatically when the device is too slow, with a short notice and a return to full detail once it can keep up, or should quality change only when the visitor picks Low, Medium or High? → A: Automatic for the 13 animated visualizations (the fluid simulation and the 12 existing animated ones), which have an Auto choice. Manual only for the 11 static visualizations, which have Low, Medium and High with Medium as the start.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stir a fluid and watch it flow (Priority: P1)

A visitor opens the Visualization Studio, finds "Fluid simulation" in the "Simulation and emergence" category, and opens it. A scene of colored dye is already swirling. They drag a finger or the mouse across the picture, and the fluid is pushed along the drag and carries colored dye with it. Swirls form, stretch and fade. They can press "Burst" for a handful of new splashes, press "Clear" to empty the picture, and use the same pause, step, speed, reset and full screen controls as in every other visualization. A short explanation beside the picture says, in plain words, how the simulation works.

**Why this priority**: It is the headline of the request and the one part that adds something new for visitors. Without it the other two parts have nothing new to show. On its own it already delivers a working, playable visualization.

**Independent Test**: Open the catalog, choose the "Simulation and emergence" filter, open "Fluid simulation", drag across the picture, then press Burst and Clear. The fluid reacts to each of them, and the explanation text is visible.

**Acceptance Scenarios**:

1. **Given** the catalog, **When** a visitor filters by "Simulation and emergence" or searches for "fluid" or "Navier", **Then** a "Fluid simulation" card with a sample picture and a one-sentence summary is shown, and opening it shows the visualization at its own address like every other one.
2. **Given** the fluid simulation has just opened with its default settings, **When** the picture first appears, **Then** it already shows at least three colored splashes flowing, so a visitor sees a recognizable fluid without doing anything.
3. **Given** the simulation is running, **When** the visitor drags across the picture, **Then** dye appears along the drag and the fluid is pushed in the drag's direction. A faster drag pushes harder.
4. **Given** a touch screen, **When** the visitor drags with two or more fingers at once, **Then** each finger stirs the fluid independently.
5. **Given** the simulation has dye in it, **When** the visitor presses "Burst", **Then** at least five new splashes of dye and motion appear at once, at different places.
6. **Given** the simulation has dye in it, **When** the visitor presses "Clear", **Then** all dye and all motion are removed and the picture is empty, ready for new strokes. The settings do not change.
7. **Given** the visitor has stirred the fluid, **When** they press Reset (the existing shortcut and button), **Then** the starting scene for the current seed returns.
8. **Given** the simulation is playing, **When** the visitor pauses it, **Then** the picture freezes exactly as it is and stays visible. Resuming continues from that state. "Step" advances one tick while paused.
9. **Given** the simulation is open, **When** the visitor reads the explanation next to the picture, **Then** it describes in plain language the stages the fluid goes through each moment (the dye and motion being carried along, the push from a drag, the pressure that keeps the fluid from piling up, and the spin that keeps small swirls alive) and what each setting changes.

---

### User Story 2 - Shape how the fluid behaves (Priority: P2)

A visitor wants the ink to hang in the water for a long time, or to splash and vanish. They open the settings panel and change how quickly the motion dies down and how quickly the color fades, and the fluid changes straight away without restarting. They can also change how much the fluid is pushed by a drag, how large each splash is, how much small-scale swirl is kept, and how carefully the fluid is kept from piling up. A few named presets give good starting points.

**Why this priority**: It turns the simulation from something to watch into something to explore, and it is where the "velocity dissipation slows the motion over time" idea from the reference becomes something a visitor can feel. It needs User Story 1.

**Independent Test**: With the simulation open, move "Velocity dissipation" from its lowest to its highest value while making the same stroke each time. At the lowest the motion carries on much longer. Then do the same with "Density dissipation" and watch the dye fade faster or slower. Switch between presets and see the character of the fluid change.

**Acceptance Scenarios**:

1. **Given** the settings panel, **When** the visitor looks at it, **Then** these settings are present with these starting values: Pressure iterations 20, Pressure 0.80, Curl 30, Splat radius 0.25, Splat force 6000, Velocity dissipation 0.20, Density dissipation 1.00. Next to them are a Quality choice, a color palette choice and the seed.
2. **Given** a stroke has just been made, **When** the visitor lowers Velocity dissipation, **Then** the fluid keeps moving noticeably longer after the stroke. When they raise it, the motion dies down sooner.
3. **Given** dye is in the fluid, **When** the visitor lowers Density dissipation, **Then** the color stays visible longer. When they raise it, the color fades sooner.
4. **Given** both dissipation settings are at their lowest, **When** the visitor makes strokes, **Then** long, lingering trails appear. **Given** both are at their highest, **Then** strokes give short bursts that vanish quickly.
5. **Given** the visitor changes any setting while the fluid is running, **When** the new value is applied, **Then** the fluid keeps its current state and carries on with the new behavior. Nothing restarts and the picture never goes blank.
6. **Given** a higher Curl value, **When** the fluid is stirred, **Then** more small swirls stay alive than at a lower value.
7. **Given** a lower Pressure iterations value, **When** the fluid is stirred, **Then** the fluid may visibly compress or leave gaps. A higher value keeps it looking evenly spread, at the cost of more work per frame. The explanation says so.
8. **Given** the preset menu, **When** the visitor opens it, **Then** it contains at least three named presets with clearly different characters (for example lingering ink, quick splashes, turbulent) and an "Animated sweep" preset like every other visualization has.
9. **Given** any combination of settings within the allowed ranges, including every setting at its minimum or maximum, **When** the visitor stirs the fluid, **Then** the picture stays stable: no sudden white-out, no flashing noise, no freeze and no permanently blank picture caused by the simulation itself breaking down.

---

### User Story 3 - Smooth on any device, with a clear message when it cannot run (Priority: P2)

A visitor on a modest laptop or a phone opens the fluid simulation. They pick the Quality level that suits their device (Low, Medium or High) and the simulation keeps a smooth pace. On very old hardware it still works in a simpler way. If the device cannot run it at all, the visitor sees a clear message in place of the picture, and the rest of the studio keeps working.

**Why this priority**: The fluid simulation is the heaviest visualization in the studio. If it stutters or silently fails on common devices, much of the audience will have a poor first impression. It makes User Story 1 trustworthy beyond a developer's machine.

**Independent Test**: Open the simulation on a modest device at each Quality level and compare smoothness and detail. In a browser or setup where the graphics features are unavailable, open it and confirm the message and that other visualizations still open.

**Acceptance Scenarios**:

1. **Given** the settings panel, **When** the visitor chooses Low, Medium or High, **Then** the simulation changes how fine its detail is: Low is coarser and faster, High is finer and slower. The starting choice is Auto, which begins at Medium and steps down for a while if the device cannot keep a smooth pace (see User Story 4).
2. **Given** a modest device, **When** the simulation runs at Low, **Then** it keeps a smooth pace (see SC-003).
3. **Given** the device's graphics support is limited (older hardware), **When** the simulation opens, **Then** it still runs, using a simpler path, and the visitor is not asked to do anything.
4. **Given** the device or browser cannot run the simulation at all, **When** the visitor opens it, **Then** a plain message explains that this visualization needs graphics acceleration that is not available here. The page does not crash, show a blank rectangle or hang, and the visitor can go back to the catalog and open other visualizations normally.
5. **Given** the simulation is running, **When** the graphics context is lost (for example the device was under memory pressure, or the tab was sent to the background for a long time), **Then** it restores itself and continues with the same settings, or it shows a short message with a "Restart" button. It never leaves a frozen or empty picture without explanation.
6. **Given** the visitor opens and leaves the fluid simulation many times in a row, **When** they keep doing so, **Then** it keeps working every time. Leaving it releases everything it was using.
7. **Given** the visitor resizes the window, rotates the phone, or enters and leaves full screen, **When** the picture size changes, **Then** the fluid keeps flowing where possible, with its dye and motion preserved, and is not reset.
8. **Given** the visitor's system asks for reduced motion, **When** the simulation opens, **Then** it follows the studio's existing reduced-motion behavior.

---

### User Story 4 - Every other visualization gets the same performance layer (Priority: P2)

A visitor opens any of the other visualizations (Mandelbrot, Game of Life, Boids and the rest). Where it makes a difference, a Quality choice is available in the same place and with the same wording as in the fluid simulation. Without any action from the visitor, an animated visualization that cannot keep up lowers its drawing cost for a while so it stays smooth, tells the visitor so, and goes back to full detail when it can. The static visualizations, which draw a picture once, have the manual choice only. At the default level, every visualization looks as it does today (for the animated simulations that move onto the graphics card, see User Story 5).

**Why this priority**: It spreads the benefit of the fluid simulation's speed-versus-detail design across the whole studio and makes the studio feel consistent. It depends on the quality concept introduced in User Story 3, but it can ship separately from User Stories 5 and 6.

**Independent Test**: On a modest device, open the heaviest existing visualizations. Confirm the Quality choice, switch to Low and see the cost drop, and confirm that at the default level the default pictures look unchanged and old share links and saved visualizations open with the same settings as before.

**Acceptance Scenarios**:

1. **Given** any existing visualization where the Quality choice would change cost measurably, **When** the visitor opens its settings, **Then** a Quality choice is shown in the same place and with the same labels as in the fluid simulation: Auto, Low, Medium and High for the animated ones, and Low, Medium and High for the static ones.
2. **Given** a visualization where changing quality would change nothing noticeable, **When** the visitor opens its settings, **Then** no Quality choice is shown, so there is no control that does nothing.
3. **Given** an animated visualization is on Auto and cannot hold a smooth pace for a few seconds, **When** that is detected, **Then** the visualization lowers how much work it does per frame, shows a brief non-blocking notice, and returns to full detail when the pace allows.
4. **Given** Quality is set to Low, Medium or High by the visitor, **When** the visualization runs, **Then** it stays at that level and does not adapt on its own. A static visualization never changes its quality on its own.
5. **Given** any share link or saved visualization created before this feature, **When** it is opened, **Then** it opens with the same settings and a picture that looks as it did before. Old items do not contain a Quality value. They open as Auto for the animated visualizations and as Medium for the static ones.
6. **Given** a visitor shares or saves a visualization with a chosen Quality level, **When** someone else opens the link or the saved item, **Then** the same settings, including the Quality level, are restored.
7. **Given** a visualization is paused, finished (for example a completed sort or maze) or hidden behind another tab, **When** it is left alone, **Then** it uses next to no processing power.
8. **Given** the visitor switches from one visualization to another many times, **When** they do so, **Then** each visualization is fully released when they leave it, and the studio's speed does not degrade.
9. **Given** the project's documentation for this feature, **When** a reviewer opens it, **Then** it contains a before-and-after measurement for every visualization showing the effect of the performance layer.

---

### User Story 5 - The existing animated simulations run on the graphics card (Priority: P2)

A visitor opens one of the 12 existing animated visualizations: Game of Life, Elementary cellular automaton, Reaction–diffusion, Boids, Langton's ant, Lorenz attractor, Double pendulum, Fourier epicycles, Recamán's sequence, Times-table circle, Sorting algorithms, or Maze generation and pathfinding. It looks and works as it always has, but it now runs on the graphics card, as the fluid simulation does. It stays smooth on modest devices, and at the higher Quality levels it can handle more cells, agents or detail. On a device without graphics acceleration, it keeps working the way it works today.

**Why this priority**: It is the larger half of applying the performance work to the other visualizations, and it gives the biggest gain in smoothness. It is separate from User Story 4 so that the shared quality controls can ship even if some simulations take longer to move than others.

**Independent Test**: On the reference laptop and phone, open each of the 12 at the same settings and seed as in the current release and compare the picture, the behavior and the pace. Then open them again with graphics acceleration unavailable and confirm each one still works.

**Acceptance Scenarios**:

1. **Given** any of the 12 animated visualizations, **When** the visitor opens it with its default settings, **Then** it shows a picture that looks like today's (see FR-035) and runs at least as smoothly as today.
2. **Given** any of the 12, **When** the visitor uses a control it has today (settings, presets, pointer interaction, Pause, Step, speed, Reset, full screen, Animated sweep, save, share, picture export, video recording), **Then** it works as before.
3. **Given** Game of Life, Reaction–diffusion, Boids or Elementary cellular automaton at High quality on the reference laptop, **When** the visitor chooses at least twice the default grid size or number of agents, **Then** it still runs at 30 frames per second or better (SC-015).
4. **Given** a device without graphics acceleration, or acceleration lost while a simulation runs, **When** the visitor opens or continues it, **Then** it carries on the way it works today, with no loss of function and no error shown.
5. **Given** the same seed and settings, **When** the visitor opens one of the 12 twice on the same device, **Then** the starting state is the same both times, and "Step" advances it by exactly one simulation step.
6. **Given** one of the six rule-based ones (Game of Life, Elementary cellular automaton, Langton's ant, Recamán's sequence, Sorting algorithms, Maze generation and pathfinding) with the same settings and seed as in the current release, **When** the visitor steps it any number of times, **Then** its state is identical to the current release's at every step.
7. **Given** the visitor opens and leaves any mix of the 12 many times, **When** they do so, **Then** each one is fully released on leaving, and none of them fails to start or slows the studio down.

---

### User Story 6 - A responsive interface without needless redrawing (Priority: P3)

A visitor drags a slider while an animation runs, scrolls the catalog, types in the Playground message box, or flips between filters. The interface responds immediately. Only the parts whose content actually changed are redrawn: moving one slider does not redraw the other controls, the catalog cards or the explanation text, and typing a message does not redraw the whole conversation.

**Why this priority**: The benefit is real but indirect. Visitors notice it as smoother dragging and typing, and it protects the animation's frame rate. It touches many files and carries a regression risk, so it comes after the user-visible parts. The earlier stories do not depend on it.

**Independent Test**: In automated tests that count how often interface parts are redrawn, perform each listed interaction and check that unrelated parts are not redrawn. Then use the studio and the Playground by hand and confirm that nothing behaves differently.

**Acceptance Scenarios**:

1. **Given** the settings panel of any visualization, **When** the visitor changes one setting, **Then** only that setting's control and the picture update. The other controls, the preset menu, the playback bar and the explanation are not redrawn.
2. **Given** an animated visualization is running, **When** the visitor drags a slider, **Then** the animation's pace stays steady (see SC-009) and the slider follows the pointer without lag.
3. **Given** the catalog, **When** the visitor types in the search box or switches the category filter, **Then** only the cards whose visibility changed are updated. Cards that stay visible are not redrawn.
4. **Given** the Playground, **When** the visitor types in the message box, **Then** the earlier messages and tool-call cards are not redrawn.
5. **Given** the Playground, **When** a new message arrives, **Then** only the new message (and the list's own container) is redrawn. Earlier messages are not.
6. **Given** any part of the interface that could be changed, **When** a change is made for performance, **Then** its look, its keyboard and screen-reader behavior, and its results stay exactly as before.
7. **Given** the project's tests, **When** they are run, **Then** every test that passed before this feature still passes.
8. **Given** the project's documentation for this feature, **When** a reviewer opens it, **Then** it contains an audit that lists every interface component of the Studio and the Playground with the decision made for it, and gives a reason for each one left alone.

---

### Edge Cases

- **Extreme settings.** Every setting at its minimum or at its maximum, and combinations such as maximum force with maximum curl, must not blow the simulation up (see User Story 2, scenario 9).
- **Zero dissipation.** If both dissipation values are at their lowest, motion and dye fade very slowly. The fluid must remain stable and readable, not saturate to a solid color. "Clear" is always available to empty the picture.
- **Very large or very high-density screens.** In full screen on a 4K or high-density display, the fluid is limited to a drawing size the device can keep smooth, as the studio already does for other visualizations, and is scaled to fit.
- **A drag that starts outside and enters the picture, or leaves it.** The stroke is cut at the edge. Leaving the picture mid-drag ends the stroke cleanly, with no stuck stroke when the pointer returns.
- **Many simultaneous touches.** More fingers than the device reports are ignored. They never cause errors.
- **Click without drag.** A single click or tap makes one small splash at that spot.
- **Same seed, same opening.** Opening the simulation twice with the same seed shows the same starting scene. "Burst" uses the same seed-based sequence.
- **Different devices.** Tiny numerical differences between devices can make long-running pictures drift apart. This is accepted. On one device, the same seed and the same strokes at the same moments give the same picture.
- **Saved and shared fluid.** A saved visualization or share link stores the settings and the seed, not the fluid's current dye and motion. Reopening starts from the opening scene.
- **Tab hidden.** The simulation pauses while the tab is hidden and resumes afterward, as with other animated visualizations. The fluid does not jump forward by a large amount of time when the tab returns.
- **Slow device on Auto.** The pace drops, the visualization lowers its cost, and the visitor sees a notice. It does not flip between levels so quickly that the picture flickers.
- **Slow device on a static visualization.** It shows its progress as it does today and never lowers its quality on its own. The visitor can choose Low.
- **Quality changed mid-run.** Changing the Quality level while running keeps the current picture and applies the new level without an empty frame.
- **Visualization with nothing to trade.** It shows no Quality choice, and its settings, saved files and links look exactly as before.
- **An existing animated simulation on a device without graphics acceleration.** It keeps working the way it works today. The visitor loses no feature and sees no error.
- **Tiny numerical differences after the move.** The six decimal-math simulations (Reaction–diffusion, Boids, Lorenz attractor, Double pendulum, Fourier epicycles, Times-table circle) may differ in tiny details from today's picture on the graphics card, especially a chaotic one that runs for a long time (Lorenz attractor, Double pendulum). Their overall look and behavior must stay the same. The six rule-based ones may not differ at all (FR-035).
- **Older saved items and links.** Items created before this feature, and items that mention a visualization or setting that no longer exists, open as they did before, with unknown values replaced by defaults and a short notice, as the studio already does.
- **Interface changes that alter behavior.** If skipping a redraw would ever show stale information (an old value in a control, an old state in a button), the control must be redrawn. Correct display always wins over fewer redraws.

## Requirements *(mandatory)*

### Functional Requirements

**The fluid simulation**

- **FR-001**: The studio MUST include a "Fluid simulation" visualization in the existing category "Simulation and emergence", with a name, a symbol, a one-sentence summary that mentions "fluid" and "Navier–Stokes" (so catalog search finds it), and a sample picture on its catalog card, like every other visualization.
- **FR-002**: The visualization MUST open at its own address in the studio and work with the existing way of opening, going back, saving, sharing and replaying visualizations.
- **FR-003**: Visitors MUST be able to drag with a mouse, a pen or one or more fingers across the picture to add colored dye and push the fluid. The push MUST follow the drag's direction and grow with its speed. A click or tap without movement MUST make one small splash.
- **FR-004**: The fluid MUST behave as a simplified Navier–Stokes fluid: dye and motion are carried along by the flow; a drag adds dye and a push at its position; the fluid does not visibly pile up or leave gaps (it behaves as incompressible); and small-scale swirls are kept alive according to the Curl setting.
- **FR-005**: The visualization MUST open with a starting scene of at least three colored splashes already flowing, chosen from the seed, so the default settings show a recognizable picture straight away.
- **FR-006**: The visualization MUST provide a "Burst" action that adds at least five splashes of dye and motion at different places, and a "Clear" action that removes all dye and all motion without changing any setting. Both MUST be usable from the keyboard and by touch. Burst also gives people who cannot drag a way to see the fluid move.
- **FR-007**: The existing Reset action MUST restore the starting scene for the current seed. Pause, Step, speed and full screen MUST work as in other animated visualizations. Because the shell already uses Space for play/pause, `.` for Step and `R` for Reset, Burst and Clear MUST NOT take over those keys.
- **FR-008**: The visualization MUST offer these settings with these starting values: Pressure iterations 20, Pressure 0.80, Curl 30, Splat radius 0.25, Splat force 6000, Velocity dissipation 0.20, Density dissipation 1.00, plus Quality, a color palette and the seed. The allowed range of each setting MUST be chosen so that every value in it is safe (see FR-011).
- **FR-009**: Velocity dissipation MUST control how quickly motion dies down over time, and Density dissipation MUST control how quickly the colored dye fades. Lowering both MUST give long lingering trails, and raising both MUST give snappy bursts that vanish quickly.
- **FR-010**: Changing any setting while the simulation runs MUST apply immediately, keep the current dye and motion, and never show an empty frame.
- **FR-011**: The simulation MUST stay stable for every combination of allowed setting values and for any sequence of strokes: no runaway brightness, flashing noise, freezing or permanently blank picture caused by numerical breakdown.
- **FR-012**: The "How it works" text next to the picture MUST describe in plain language, without code, what the simulation does each moment (carry the dye and motion along, add what the visitor drags, keep the fluid from piling up, keep small swirls alive, and let motion and color fade) and what each setting changes. It MUST state that velocity dissipation slows the motion over time and density dissipation fades the dye.
- **FR-013**: The visualization MUST ship at least three named presets with clearly different characters, plus an "Animated sweep" preset, and a sample picture for its catalog card, so that it meets the same requirements as every other visualization (features 003 and 004).
- **FR-014**: Saving and sharing the visualization MUST store its settings and seed, and MUST restore them on opening. The dye and motion at the time of saving are not stored (see Edge Cases). Picture export and video recording MUST work for it as for other visualizations.
- **FR-015**: The visualization MUST follow the studio's existing reduced-motion behavior, and every action it adds MUST be reachable and understandable by keyboard and screen reader.
- **FR-016**: When the device or browser cannot run the simulation, the visitor MUST see a plain-language message in place of the picture, and the rest of the studio MUST continue to work. On older hardware with limited graphics support the simulation SHOULD still run, using a simpler path, without the visitor being asked to do anything.
- **FR-017**: If the graphics context is lost while the simulation runs, the visualization MUST recover on its own with the same settings, or show a message with a "Restart" action. It MUST NOT leave a frozen or empty picture without explanation.
- **FR-018**: When the visitor leaves the visualization, or opens a different one, everything it used MUST be released. Repeatedly opening and leaving it MUST NOT make it, or the studio, fail or slow down.
- **FR-019**: When the picture size changes (window resize, rotation, full screen), the fluid MUST keep flowing with its dye and motion preserved where possible, and the drawing size MUST stay within what the studio already allows for other visualizations.

**The shared performance layer for all other visualizations**

- **FR-020**: Every visualization where it makes a measurable difference MUST offer a Quality choice in the same place and with the same labels as the fluid simulation: Auto, Low, Medium and High for the animated ones, and Low, Medium and High for the static ones, which start at Medium. A Quality choice is "measurable" if switching between Low and High changes the work per frame, or the time to a finished picture, by at least 20%. Visualizations without such a trade-off MUST NOT show the choice.
- **FR-021**: At Medium (their starting choice), each of the 11 existing static visualizations MUST produce exactly the same picture it produces today for the same settings and seed. At Medium, and at Auto whenever the device keeps a smooth pace, each of the 12 existing animated visualizations MUST meet FR-035. Existing automated tests, share links and saved visualizations MUST keep working. Items without a Quality value MUST open as Auto for the animated visualizations and as Medium for the static ones.
- **FR-022**: At Low, a visualization MUST do measurably less work than at Medium to show a comparable picture, and at High it MUST show finer detail at the cost of more work. The Quality level chosen MUST be stored in saved items and share links and restored on opening.
- **FR-023**: On Auto, when an animated visualization (the fluid simulation or one of the 12 existing ones) cannot hold a smooth pace for a few seconds, it MUST reduce how much it draws or computes per frame, tell the visitor with a short non-blocking notice, and return to full detail when the pace allows. This adaptation MUST NOT change the visualization's settings, its saved items or share links, and MUST NOT restart the visualization or show an empty frame. It MUST NOT cause visible flicker by switching back and forth quickly. Static visualizations MUST NOT change their quality on their own.
- **FR-024**: A visualization that is paused, has finished its run, or is hidden MUST use next to no processing power.
- **FR-025**: No visualization may block the page for longer than 50 milliseconds at a time, as the existing module contract already requires. This MUST still hold at every quality level.
- **FR-026**: The feature's documents MUST record, for every visualization and every quality level it offers, a before-and-after measurement of the pace (or the time to a finished picture) on the reference devices defined in the Assumptions.

**A leaner interface**

- **FR-027**: Across the whole project (the Visualization Studio, the Playground chat page and the hooks they share), interface parts MUST NOT be redrawn when the information they show has not changed. This covers at least: each settings control, the preset menu, the playback bar, the explanation text, the catalog cards, the list of saved visualizations, and the Playground's messages, composer and capability panel. This applies to every interface part that can receive unchanged information from a part that is redrawn. A part that is only ever redrawn together with its parent needs no change. Planning MUST produce a written audit that lists every interface component of the Studio and the Playground, what was done for it and, for any left alone, the reason.
- **FR-028**: Values that are worked out from other values (for example the filtered catalog list, a validated configuration, a list of options) MUST be recomputed only when the values they depend on change.
- **FR-029**: Actions handed down to interface parts MUST stay the same between redraws unless what they do has changed, so that they do not cause redraws of the parts that receive them.
- **FR-030**: Every such change MUST keep the interface's look, keyboard and screen-reader behavior and results identical. A change that would show stale information is not allowed, and a change that adds work without avoiding any redraw SHOULD NOT be made.
- **FR-031**: Automated tests MUST check, by counting redraws, that unrelated parts are not redrawn in at least these interactions: changing one setting, typing in the catalog search, switching the category filter, typing in the Playground message box, and receiving a new Playground message.

**The existing animated simulations on the graphics card**

- **FR-032**: Each of the 12 existing animated visualizations (Game of Life, Elementary cellular automaton, Reaction–diffusion, Boids, Langton's ant, Lorenz attractor, Double pendulum, Fourier epicycles, Recamán's sequence, Times-table circle, Sorting algorithms, Maze generation and pathfinding) MUST run its drawing on the graphics card, and also its simulation step wherever that step can be done for many cells, agents or items at once. Planning MUST record, for each of the 12, what moves and why anything stays where it is.
- **FR-033**: Each of the 12 MUST keep every control and behavior it has today: its settings and presets, its pointer interaction, Pause, Step, speed, Reset, full screen, its Animated sweep, saving and sharing, picture export, video recording and its catalog sample picture.
- **FR-034**: When graphics acceleration is unavailable, or is lost while one of the 12 runs, it MUST carry on the way it runs today, with no loss of function. If it is lost mid-run, the visualization MUST keep its current state where possible. Otherwise it MUST restart from its opening scene with a short notice.
- **FR-035**: The six rule-based ones (Game of Life, Elementary cellular automaton, Langton's ant, Recamán's sequence, Sorting algorithms, Maze generation and pathfinding) MUST produce exactly the same sequence of states as today for the same settings and seed, at every step. The other six (Reaction–diffusion, Boids, Lorenz attractor, Double pendulum, Fourier epicycles, Times-table circle) MUST show a picture that matches today's in colors, layout and kind of pattern at their default settings and seed, so that a viewer comparing the two side by side sees no difference at a glance. For all 12, the same seed MUST give the same starting state on one device, and "Step" MUST advance exactly one simulation step.
- **FR-036**: When the visitor leaves one of the 12 or opens a different visualization, everything it used MUST be released. Opening and leaving any mix of them 30 times in a row MUST NOT make any of them fail to start or slow the studio down.

### Key Entities

- **Fluid simulation (visualization)**: The new catalog entry. It has a name, summary, category, sample picture, explanation, settings, presets and a seed, and it behaves as a visualization module like the others do.
- **Fluid settings**: Pressure iterations, Pressure, Curl, Splat radius, Splat force, Velocity dissipation, Density dissipation, Quality, palette and seed. Each has a starting value and a safe allowed range.
- **Stroke / splash**: One piece of visitor input (drag, tap, or a Burst splash), with a position, a direction, a speed and a color. It adds dye and a push to the fluid.
- **Quality level**: Low, Medium or High, plus Auto for the animated visualizations. A visualization-wide setting that trades detail for speed. It is saved and shared with the other settings. Auto (animated only) starts at Medium and steps down temporarily if the pace is poor. Static visualizations start at Medium and never change on their own.
- **Performance measurement**: A recorded before-and-after pace (or time to a finished picture) for one visualization at one quality level on one reference device.
- **Redraw count**: How often an interface part is redrawn during a defined interaction, used by the automated checks for the leaner interface.
- **Processor path (fallback)**: The way each of the 12 animated visualizations runs today, without the graphics card. It stays as the fallback when graphics acceleration is unavailable or lost.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can go from the catalog to a moving fluid in under 5 seconds, by choosing the "Simulation and emergence" filter or searching "fluid" and opening the card, and the picture is already moving within 3 seconds of opening on a reference laptop.
- **SC-002**: Within 10 seconds of opening the fluid simulation, a first-time visitor can drag across the picture and see the fluid respond, with no instructions beyond the page itself.
- **SC-003**: At its starting settings (Quality on Auto), the fluid simulation keeps an average of at least 50 frames per second on the reference laptop, and at Low quality an average of at least 30 frames per second on the reference phone.
- **SC-004**: The fluid visibly reacts to a pointer movement within 100 milliseconds.
- **SC-005**: A single stroke keeps moving the fluid at least 3 times longer at the lowest Velocity dissipation than at the highest, and its dye stays visible at least 3 times longer at the lowest Density dissipation than at the highest.
- **SC-006**: With every fluid setting at its minimum, with every setting at its maximum, and with each single setting at either extreme while the others stay at their starting values, the picture stays stable through at least one minute of running with repeated strokes (no runaway brightness, no freeze, no blank picture).
- **SC-007**: Opening and leaving the fluid simulation 30 times in a row works every time, and the studio's pace after the last time is within 10% of its pace before the first.
- **SC-008**: On the fluid simulation and on every other visualization that offers a Quality choice, Low needs at least 30% less work per frame (or at least 30% less time to a finished picture) than Medium. The measurements are recorded in the feature's documents.
- **SC-009**: Dragging a slider while an animated visualization runs lowers its frame rate by no more than 10%, and the slider follows the pointer without a visible delay.
- **SC-010**: On the reference phone, every animated visualization on Auto reaches at least 30 frames per second within 3 seconds, or shows the visitor why it cannot.
- **SC-011**: 100% of the 11 existing static visualizations produce an unchanged default picture for the same settings and seed at their starting choice (Medium), the 12 animated ones meet FR-035 (at Medium, and at Auto on a device that keeps up), and 100% of the share links and saved visualizations made before this feature open with the same settings as before.
- **SC-012**: In the automated redraw-count checks, 100% of the listed interactions leave their unrelated interface parts un-redrawn, and every test that passed before this feature still passes.
- **SC-013**: A visualization that is paused, finished or in a hidden tab uses next to no processing power, measured as less than 1% of one processor core on the reference laptop.
- **SC-014**: On the reference laptop and the reference phone, each of the 12 existing animated visualizations at Medium quality is at least as smooth as it is today (average frame rate no lower than the baseline measured before the change).
- **SC-015**: At High quality on the reference laptop, Game of Life, Reaction–diffusion, Boids and Elementary cellular automaton run at 30 frames per second or better at no less than twice their default grid size or number of agents.
- **SC-016**: For each of the six rule-based visualizations, an automated comparison against today's version finds 100% identical states for every shipped preset and at least five different seeds, over at least 1,000 steps (or until the run finishes, if that comes first).
- **SC-017**: The written interface audit (FR-027) covers 100% of the interface components in the Studio and the Playground, and every component left alone has a recorded reason.

## Assumptions

- **What "the optimization engine" covers (clarified 2026-11-24).** The request says to "apply the optimization engine to all other". It means two things. First, the quality levels that make the fluid simulation smooth are shared with all 23 existing visualizations, and the automatic adaptation is shared with the 12 animated ones (the 11 static ones draw a picture once, so they have no frame rate to protect). Second, the 12 existing animated visualizations also move onto the graphics card, as the fluid simulation does. The 11 static visualizations (Barnsley fern, Chaos game, Collatz coral, Diffusion-limited aggregation, Julia set, L-system, Mandelbrot set, Pascal's triangle mod n, Phyllotaxis, Ulam spiral, Voronoi and Delaunay) get the shared layer only. Their drawing stays as it is, and their default pictures do not change.
- **Some of the 12 animated visualizations are step-by-step algorithms.** Sorting algorithms, Maze generation and pathfinding, Langton's ant and Recamán's sequence do one thing after another and gain little from running many cells at once. For these, the drawing moves to the graphics card and the step logic stays as it is, unless planning shows that more can move. Planning records the decision for each of the 12 (FR-032).
- **Category.** The fluid simulation goes in "Simulation and emergence", beside Reaction–diffusion and Boids. No new category is created.
- **The reference page is a description of behavior, not a source of content.** It is used for the list of settings, their starting values and the plain-language idea of how the simulation works. The page itself shows no setting ranges, so ranges are chosen during planning to be safe. No text, code or art from it is copied. The explanation text is written fresh. The starting values match those commonly used for this kind of simulation.
- **Keys differ from the reference page.** The reference page uses Space for a burst and P for pause. In the studio, Space already toggles play/pause, `.` steps and `R` resets, so Burst is a button (and gets its own key only if planning finds a free one that does not collide with the shell).
- **Fluid state is not saved.** Saved items and share links keep settings and seed only. Reproducibility holds on a single device; small numerical differences between devices are accepted.
- **Reference devices.** "Reference laptop" means a mid-range laptop from the last five years with integrated graphics. "Reference phone" means a mid-range phone from the last four years. Baseline measurements are taken in planning, before any change.
- **Quality for the other visualizations.** Each existing visualization decides what Low and High mean for it (grid size, number of agents, depth of detail, drawing resolution and so on). Medium keeps today's behavior, and so does Auto on an animated visualization whenever the device keeps up. For the 11 static visualizations the default picture is exactly the same, and for the 12 animated ones FR-035 applies (exactly the same states for the six rule-based ones, a match at a glance for the other six). Existing share links and saved items keep their settings.
- **Scope of the interface work.** "In the project" is read as all interface code: the Visualization Studio and the Playground chat page, including the hooks they share. The user named the usual memoization techniques (component memoization, memoized values and stable callbacks). They are applied everywhere they can avoid a redraw (clarified 2026-11-24, see FR-027). Applying them where they cannot have an effect is not a goal, because it would add cost and make the code harder to read.
- **Out of scope.** Three-dimensional fluids, obstacles and solid shapes, other kinds of simulation from the reference site (smoke, fire), sound, and moving the 11 static visualizations onto the graphics card.
- **Testing without graphics hardware.** The project's automated tests run without a graphics card. The simulation's rules are therefore expected to be checkable separately from drawing, and the drawing is checked by hand and on real devices. The existing processor versions of the 12 animated visualizations stay as the fallback (FR-034) and as the reference the automated tests keep checking against, so today's tests remain valid. The exact-match check for the six rule-based ones (FR-035, SC-016) needs the graphics-card version to actually run, so planning MUST provide an automated way to run it without a physical graphics card (for example a browser-based check using software rendering).
- **Targets to confirm after baseline measurement.** The "twice the default size or count at 30 frames per second" target in SC-015 and the "at least as smooth as today" target in SC-014 are starting points. They are confirmed or adjusted once planning has measured the baseline on the reference devices.
- **Dependencies.** The feature builds on the visualization module contract (feature 003) and on the sweep and thumbnail requirements (feature 004). The new visualization must satisfy the same contract checks as every other one.
