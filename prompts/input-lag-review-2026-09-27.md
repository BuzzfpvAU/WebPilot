# Input lag change, reviewed: findings and the plan to act on them

You are picking up the input lag work on branch `claude/sharp-einstein-80sgui`
(commit 903f95b, merged with main as fd0bba1, PROGRESS.md entry "Input lag: the
low latency canvas was never asked for, Auto graphics measures, and the OSD
leaves the layout path"). Read `CLAUDE.md` first. It is the constitution for
the product. This file is the plan for THIS work, written on 2026-09-27 by a
second model that reviewed the change on the owner's ask ("review the work and
find more performance improvements, find bugs, then make a plan"). Do not
rewrite this document; append to PROGRESS.md as you go, as always.

The rules of the repository hold throughout: no change to a threshold, a
budget, a verify band or `tests/`; no change to the physics, the plant, the
module ABI or the build without putting it to the owner first; `main` is
append only; no em or en dashes anywhere; every turn that changes code appends
to PROGRESS.md with a RUN LOG; never report a check you did not run in the
same turn; and before the turn ends, ask the owner whether to run a
verification pass and at what scale (none, cheap, shots, verify, fly it).

## What was reviewed, and how

The whole diff of 903f95b, read against the code it plugs into: the frame loop
(`src/main.js` around the draw decision and the Auto block),
`src/render/post.js`, `src/render/quality.js`, `src/render/pace.js`, the city
and built pipelines'
`setSize`, `src/input/input.js`'s poll, the Settings rows, the OSD CSS, and the
harness scripts that read the OSD or capture the canvas. Four probes were run
in this container's headless Chromium (SwiftShader, so no GPU number here is a
laptop's; the probes ask questions whose answers do not depend on the GPU).
Their results are in PROGRESS.md under "Input lag change reviewed" and quoted
below where they matter.

What the review agrees with, so you do not re-check it: the low latency canvas
really was never requested (three.js r160 drops the attribute, and the shell
now makes the context); the forced layout, the bars, the nubs and the OSD rate
are right; `contain: layout style` on the OSD blocks has no fixed descendants
and changes nothing; an opaque canvas is safe (nothing clears the canvas to
alpha 0, `post.js` clears to alpha 0 only into its own normal target); the
pause on leaving fullscreen uses the two calls Escape makes; screenshots of
the desynchronized canvas through `Page.captureScreenshot` are not black
(probed, identical pixel statistics with Low latency view on and off, so
`scripts/shots.js` is unaffected here); polling a WebGL fence costs nothing
measurable (2000 calls of `getSyncParameter` on a pending fence: under a
nanosecond each, the status is a client side cache updated between tasks,
which is exactly why the timer poll is needed); the physics path is untouched
and the trace hash is unchanged; and the lint:input failures during the work
were two orphaned browsers starving the container, not the change.

## Findings, ranked

Each has what is wrong, the evidence, why it matters, the fix, and how to
prove the fix. File and line numbers are as of fd0bba1.

### F1. Auto and the Render scale slider do nothing on the freestyle maps (HIGH)

What. The change's own note says the resolution factor "reaches the race
field's pixel ratio and the town's and the built map's internal scale alike".
It does not. Only the race field (and a custom track on it, which is what the
owner's ticket was flown on) follows it. On `city` and `built`:

- `loadMap` is handed `renderScale: renderScaleOf(ui.settings)` (`src/main.js`
  1229, 1249, 4524, 4553) and nothing under `src/maps/` reads `renderScale`.
- `applyRenderScale` (`src/main.js` 4870) writes `view.post.userScale` only
  when the post object already has that property. No post object in the
  repository defines `userScale` (grep the tree), so the branch never runs.
- The pipelines size their targets with their own math in `setSize`
  (`src/maps/city/index.js` 474 to 486, `src/maps/built/index.js` 300 to
  308): `forceScale || preferScale || dpr based`, clamped to `pixelBudget` and
  `minScale`. No user factor anywhere.
- Worse, both restore the pixel ratio they captured AT CONSTRUCTION on every
  resize: `this.renderer.setPixelRatio(this.shellPixelRatio)` (city 502, built
  324, captured at 466 and 286). So when Auto lowers the shell's ratio and
  walks the resize path, the pipeline puts the boot ratio back and calls
  `renderer.setSize(w, h, false)` again. The shell's own record
  (`shell.pixelRatio`) then disagrees with the renderer until the next map
  swap sets both.
- `npm run lint:quality`'s "city: the Render scale slider reaches the internal
  buffer" passes because it tests the FORMULA (`internalScale(1600, 900,
  cityHigh, null, 0.5)` in `scripts/quality-check.js`), not the pipeline. The
  harness hook `window.__renderScale` (`src/main.js` 9222) computes the same
  formula and reports it as if it were the pipeline's scale.

Why it matters. The freestyle maps people build are what the owner calls the
point of the product (the front door's CLAUDE.md), and they are the heavier
worlds (ink pass, fxaa, HalfFloat targets, petals). On them Auto currently
walks its factor down to the floor with no effect on the frame, then, on the
title, moves the preset down, which is the only lever that actually reaches
them. A pilot who moves the Render scale slider on a built map has been
moving nothing since the slider shipped. This is pre-existing for the slider
and inherited by Auto; the change's claim and its Settings note are wrong
about it either way.

Fix.
1. Give `CityPipeline` and the built pipeline a `userScale` (default 1). In
   `setSize`, compute the scale exactly as today, then multiply by
   `userScale` and clamp from below to `minScale` (Low 0.55, Medium 0.85, High
   1.0, which are the floors quality.js already states for these pipelines).
   At `userScale` 1 nothing changes, so every pinned number in `npm run
   verify` (map isolation P2, P5, P10 at 1080p High) stays where it is. Do
   NOT switch the pipelines to `internalScale` wholesale: the check's own
   comment records that the formula and the pipeline disagreed once (1.0
   against 1.34 at 1600 by 900 High) and the pinned frame is the pipeline's.
2. Read the shell's pixel ratio at the top of `setSize` (before the vendored
   `super.setSize` forces it to 1) instead of at construction, so a preset or
   DPR change still propagates.
3. In `applyRenderScale`, when the current view's post has `userScale`, pass
   scale 1 to `applyPixelRatio` (the canvas stays at the preset's native
   ratio) and set `view.post.userScale` to the factor. Otherwise the picture
   is reduced twice, once in the targets and once in the canvas.
4. Tell Auto where the real floor is on these maps. Expose on the post the
   factor below which further reduction has no effect (`minScale` over the
   scale it would use at factor 1) and make `autoFloorFor` use it, so
   `floorOverMs` counts at the true floor and the demote comes when it should.
   On High the city floor is 1.0, so Auto's only lever there is the preset,
   which is the design (`minScale: 1` keeps the pinned frame).
5. Make `window.__renderScale` report `view.post.scale` and `view.post.size`
   as the pipeline has them, beside the formula, and add a check to
   `scripts/quality-check.js` or `scripts/frame-check.js` that opens a built
   map, sets the slider to 55 and reads the target size back through the
   hook: this is the check that was missing.

Prove it. The new check; `npm run lint:quality`; `npm run verify` (checks 15
and 16 pin the field and the city at High; every measured value must be
unchanged); a probe flying the built showpiece with Auto on under SwiftShader
and reading `view.post.size` stepping down as `factor` does.

### F2. Auto and the gate assume a 60 Hz display (HIGH)

What. `src/render/autoscale.js` decides "over" with `dtEma > 18.5 ms` and
"easy" with `dtEma < 17.5 ms` (`OVER_DT_MS`, `EASY_DT_MS`, lines 77 to 79),
and `src/render/gpugate.js` calls the GPU saturated above 85 percent of
`1000 / 60`. `quality.js` names the Steam Deck in its 40 Hz mode as Low's
target machine. On a 40 Hz display, a 50 Hz panel, or any browser holding
requestAnimationFrame at 30 Hz (battery saver, some Linux compositors,
Chrome's own throttling of an occluded window), the frame interval is 20 to
33 ms with the GPU idle. Auto reads that as over budget from the first
second, walks the resolution to the floor, then moves the preset down on the
title, and because "easy" can never be true there it never climbs back.

Evidence. The constants, and the `over` and `easy` lines (autoscale.js 158
to 161). Not probed: headless Chromium cannot emulate a 40 Hz display.

Fix. Learn the display period and measure against it, with one care: a GPU
saturated on a 60 Hz display also produces steady 33 ms frames, and that is
the case Auto exists for, so the display estimate must be learned only while
the GPU is clearly not pacing the frames.
- Keep a ring of the last 120 intervals (latency.js already keeps one; share
  it or move it). The display period estimate is the 10th percentile of that
  ring, updated only while the gate's average is under half the current
  target (or while there is no fence support, accepting the ambiguity there),
  snapped to the nearest standard rate (30, 40, 48, 50, 60, 72, 75, 90, 100,
  120, 144, 165, 240 Hz) when within 5 percent of one, starting at 16.7 ms.
- The target frame is `max(displayMs, 1000 / 60)`: the aim stays sixty, and a
  faster display does not raise the bar (the gate's comment already says
  this), but a slower display lowers it.
- Express `over`, `easy`, `FAST_DISPLAY_DT_MS`, `gpuShare` and the gate's
  saturation against the target, not against 16.7.
- `latency.refreshHz()` reports the same estimate. Today it is the 25th
  percentile of all intervals, which reads 30 Hz on a saturated 60 Hz screen,
  and the Settings note prints it as the screen's refresh.

Prove it. Write `scripts/autoscale-selftest.js` (Node only, seconds, the
module is pure): feed synthetic frames and assert that 25 ms intervals with a
5 ms GPU never step down; that 33 ms intervals with a 30 ms GPU step down
within a second; that a 60 Hz display saturated to 33 ms is NOT learned as a
30 Hz display; that a step down is followed by no step up for ten seconds;
and the hidden tab case from F3. Add it to the RUN LOG for every later change
to either module. The same file should cover gpugate.js with a fake `gl`.

### F3. The GPU gate learns from time that was not GPU time (MEDIUM)

What. `gpugate.js` times a fence as `now - at[i]` with no bound (`time`, line
94; `poll`, 108; `submitted`), and `reset()` (line 174) is never called by
`main.js`. A tab hidden with a fence pending, a context loss, or a long stall
of the page hands the average a sample of seconds.

Evidence. Probed on the title at 320 by 180: the gate's average was 155 ms
over 64 samples; the page was frozen for three seconds through
`Page.setWebLifecycleState` and resumed; two samples later the average read
759 ms. On a real GPU that is the guard holding every other draw for the 20
to 70 frames it takes the average to decay below saturation after every alt
tab, and Auto reading `gpuShare` over 0.9 for a few hundred milliseconds,
which can be most of a step's hold time.

Fix. Discard a sample over 250 ms (a frame that long is a freeze, not
information). Call `gpuGate.reset()` from the hidden branch of the
visibilitychange handler that pauses the flight (`src/main.js` 9153), on
`webglcontextrestored`, after a map swap, and after `applyRenderScale`
reallocates targets (the next fence includes the reallocation). Consider
resetting the average too on a hidden tab, not only the ring: a machine that
was throttled while hidden has an average that means nothing.

Prove it. The selftest above (a 3000 ms sample leaves the average alone), and
rerun the hidden probe (the scratchpad's `review-probes.mjs hidden`, or
rewrite it): the average must not move across the freeze.

### F4. Auto keeps stale evidence across a hand picked preset (MEDIUM)

What. `demote` and `promote` are cleared only inside `autoMovePreset`
(`autoScale.resetEvidence()`, `src/main.js` 4928). A pilot who lands with
`demote` set, opens Settings from pause, picks a preset by hand (which
leaves Auto and rebuilds the world) and then picks Auto again carries the old
flag onto the new preset; on the title `autoMovePreset` fires on evidence
gathered on a different world. The same flag survives a map change and a
window resize.

Evidence. Probed end to end: flying a built map on Low with Auto, `demote`
set at 15 s; pause; Medium picked by hand (`demote` still true, the world
rebuilt at Medium); Auto picked again (`demote` still true, factor 1); Quit
to title. Within five seconds of the title the preset was Low again with
`demoted` true, moved by `src/main.js` 9029 to 9033 (`demote && at > 0`) on
evidence that was gathered on Low, before the pilot said Medium.

Fix. Call `autoScale.resetEvidence()` and set the factor back to 1 whenever
graphicsAuto turns on, whenever the preset changes by any hand (applySettings
with a new `graphics`), after every map swap, and on a window resize that
changes the pixel count by more than a tenth. Reset `floorOverMs` when the
scale leaves the floor (it is reset only when `over` is false).

Prove it. The selftest, and the stale probe run to its end: after Auto is
picked again and the title reached, `graphics` must still be Medium until
fresh evidence says otherwise.

### F5. The boot time GPU name guess fights the preset Auto chose (MEDIUM)

What. `src/main.js` 747 to 776 lowers the preset at boot whenever
`graphicsAuto` is true: a software renderer to Low, an integrated GPU from
High to Medium. Auto now persists the preset it settles on with
`graphicsAuto` still true (autoMovePreset, `ui.persistSettings()`). So an
Iris or UHD laptop that Auto promoted to High after 45 s of headroom is put
back to Medium at the next boot and promoted again after 45 s: a world
rebuild on the title every session. A session in which Auto promoted and
then demoted (High did not hold) repeats both rebuilds next session, because
`autoDemoted` and `autoPromoted` are per session.

Evidence. The two blocks, read together. Not probed.

Fix. Two stored fields in `DEFAULTS` (ui.js): `graphicsAutoMeasured` (true
once Auto has moved the preset on measurement; the boot guess lowers only an
unmeasured preset, which keeps the guess for the first boot where it is the
only information) and `graphicsAutoCeiling` (a preset Auto found not to hold:
set when a promotion is followed by a demotion; promote never above it; the
Graphics row's note can say "High was tried on this machine and did not hold
sixty"). Both cleared when the pilot picks a preset by hand, since that ends
Auto's say. The boot guess still runs for a machine that has never been
measured. `tests/shell-baseline.json` may move if the note grows; argue it
the usual way.

Prove it. A probe with two boots against one localStorage: after Auto
promotes on the first, the second boots on the promoted preset and does not
rebuild on the title.

### F6. Auto paces Low and Medium below the rubric's floor (a DECISION)

What. Rubric F4 (`prompts/bando-perf-loop.md`, and `MIN_INTERNAL_PIXELS` in
quality.js) says an automatic pacer may not take a 1080p panel under
1,200,000 internal pixels "to buy a frame". The change applies that on High
only and lets Auto reach the slider's 55 percent on Low and Medium. At the
owner's 1896 by 943 window on Low (ratio 0.85, 1.29 Mpx) the floor is 0.39
Mpx; honouring F4 there would leave Auto 4 percent of headroom and nothing
to do but demote, and on Low there is nothing to demote to.

Recommendation. Keep the exception on Low, where a blurrier sixty is the
only rescue left, and honour F4 on Medium, where a demote exists. Write the
exception into quality.js beside `MIN_INTERNAL_PIXELS` and into PROGRESS.md
as a decision the owner made, with the date. Do not decide it silently: put
the two options and these numbers to the owner and record the answer.

### F7. pace.js is dead, and now duplicated (CLEANUP)

What. `src/render/pace.js` was the resolution controller that never got a
map (its guard in `src/main.js` 8982 requires `view.post.applyPace`, which
nothing implements). autoscale.js does its job. `window.__pace` is read by no
script or test (grep `__pace` in scripts and tests).

Fix. Delete pace.js, `createPace`, `PACE_COOL`, the observe block and the
hook; update the sentence in quality.js's header that names pace.js as the
reason Render scale is not automatic, since it now is. `src/fresh.js` is
regenerated (`node scripts/gen-preload.js`), and a module deleted from the
served list needs `npm run lint:preload` and `npm run check:fresh` green.

### F8. Two small per frame costs (LOW)

- `.bar-fill` and `.osd-nub-track` change `transform` every frame the
  throttle or a stick moves and are not promoted to their own layers; a
  transform change on an unpromoted element repaints the layer it sits in.
  `.lock` already carries `will-change: transform` (index.html 5322). Add it
  to the other two. Three elements, no memory to speak of.
- `notePadRoster()` runs on every 2 ms poll and builds a Set and a string per
  pad each time (`src/input/input.js` 1843 to 1845), and `listGamepads()` is
  called twice per poll (`firstGamepad` and the roster). Hotplug is not a 2 ms
  event: run the roster every 100 ms, and hand `firstGamepad`'s list to it.
  The bench found `navigator.getGamepads()` itself at 3 ns a call with no pad
  connected; the cost is the garbage, which is a GC pause on a weak CPU.

Prove it. `npm run input:selftest` and `npm run lint:input` for the roster;
the OSD trace Opus used for the bars (scratchpad `osdtrace.mjs`, or a new
one) for the layers, though the win is small enough that a clean lint is
proof enough.

### F9. The latency readout can only say "at least" (LOW)

What. Event Timing reports events of 16 ms or more, in 8 ms steps, so
"About 24 ms" is the floor of what the row can show, and on a fast machine
the number is its own threshold rather than the machine's latency. For the
one thing the owner needs it for, an A/B of Low latency view on their laptop,
a number that cannot go below 16 to 24 may not move.

Fix. Add the page's own reading beside it: on every press, `event.timeStamp`
to the next frame callback's timestamp plus one frame (the earliest the
picture can carry it), at millisecond resolution, median of the last 64. Say
in the note which is which. Keep Event Timing, which is the only one that
sees presentation.

## Phase 0, for the owner, before any GPU side work

Nothing in this container has a GPU, so the next piece of evidence has to come
from the laptop. Ask the owner for these, in this order, and read the answers
before touching the render passes:

1. Fly Flags and cones on the Iris Xe laptop and send a bug report from the
   pause screen. Read `perf` in the ticket: `flight.fps` and `frameMs` (was it
   really sixty in flight), `gpuMs` (is the GPU the limit: over 14 ms says
   yes), `held` (did the guard fire), `keyToScreen`, `hz`, `lowLatency` (did
   Linux Chrome grant it), and `stick.flight.padHzMax` with the radio (the
   browser's own gamepad rate; near 60 means the browser adds up to 16 ms the
   page cannot remove).
2. Settings, Screen: read Input to screen; switch Low latency view off,
   reload, read it again. If it did not move, the low latency path is not
   engaged on that platform whatever the attribute says.
3. `chrome://gpu` on the laptop: Compositing, Canvas and Rasterization must
   say Hardware accelerated. Software compositing on Linux is a full frame of
   readback per frame and would produce exactly "sixty frames and unflyable".
   `chrome://version` shows whether Chrome runs on Wayland or X11.

If `gpuMs` says the GPU is comfortable and the lag persists, the remaining
latency is outside the page (compositor, display, gamepad rate) and Phase 2
is not worth doing first.

## Phase 1, now, no data needed

In this order, one commit each, each with its PROGRESS entry and RUN LOG:

1. F3 (the gate's samples and resets). Smallest, clearest.
2. F4 (stale evidence).
3. F2 (the display period), with `scripts/autoscale-selftest.js` written first
   and run on the current code so the failing cases are seen to fail.
4. F5 (the boot guess and the remembered preset).
5. F8 (the two layers, the roster).
6. F7 (delete pace.js).
7. F1 (the town and the built map follow the factor), last because it touches
   the pipelines the budgets pin, and only with `npm run verify` run before
   and after and every pinned value shown unchanged.
8. F9 if the owner's Phase 0 reading of Input to screen turned out not to
   move.

After each: `npm run input:selftest`, `npm run lint:frame`, `npm run
lint:quality`, `npm run lint:preload`, `npm run check:fresh`, `npm run
lint:shell`, `npm run lint:input`, the new selftest, and for F1 and F7 `npm
run verify`. lint:nouns fails on main today ("Drift course" in
`src/maps/built/showpiece.js`); it is not this work's and must not be fixed
by editing the lint.

## Phase 2, after Phase 0's numbers, only if the GPU is the limit

- An 8 bit composer target at Low instead of RGBA16F (`src/render/post.js`
  398): halves the bandwidth of the scene target on a fill bound iGPU. The
  cost is banding in dark skies; A/B it with a screenshot pair before
  proposing it, and it stays Low only.
- Dynamic resolution without reallocating targets: allocate the composer's
  targets once at the preset's full size and render into a sub rectangle
  (viewport and scissor, the grade pass sampling the scaled UV), so an Auto
  step costs no allocation and no hitch. Today every step reallocates and
  the controller waits out a 200 ms hitch window for it.
- Decide F6 with the owner.

## Phase 3, the drastic ones, added on the owner's ask

Opus's work took the queue out of the pipeline. What is left at 60 Hz is
quantisation, and each item here removes one term of it. The chain on the
owner's laptop, roughly: Chrome's gamepad sampling 0 to 16 ms, the page's
poll up to 2, the wait for the frame that consumes the sample 0 to 16.7,
the frame shown one vsync after it is drawn 16.7, the panel 5 to 30. Items
are in the order to take them. 1 is a fix to make; 2 is a fix gated on a
number from the owner's laptop; 3 is a question for the owner and not a
change to make; 4 is an experiment on real hardware only; 5 is for the
owner. The rules at the top of this file hold for all of them, and 2 and 3
are input path work, so the verify-flight-model skill applies to them.

### P3.1. Render the predicted pose, not the current one (about a frame)

What. A frame shows the state at its own vsync time and is seen a vsync
later, so the picture lags the simulation by one frame, always. The sim
writes everything a one frame prediction needs into the state block
(`src/native/sim_abi.h`: velocity in doubles 4 to 6, world frame; body
angular rate in 11 to 13, body frame). At the render boundary, extrapolate
the drawn pose forward to the presentation time: position plus velocity
times dt, orientation rotated by the body rate times dt (quaternion times
the exponential of half the rate vector, in the body frame, then converted
once in `src/render/frame.js` as everything is). VR runtimes do exactly
this. The error over one frame is invisible: a 3000 degree per second
squared flick is 0.4 degrees off, three g is four millimetres.

Why it is safe. Render only. The physics, the trace, the replay files and
every determinism check are untouched, because nothing here feeds back.

Fix.
- The horizon is the time from this frame's timestamp to when it will be
  seen: one display period, from F2's estimate (start at 16.7 ms), plus
  the frame's own age when the callback runs late. Cap it at 25 ms so a
  hitch does not throw the picture ahead.
- Where the shell blends `statePrev` and `stateCurr` for the draw
  (`src/main.js`, the interpolation the CLAUDE.md rule describes), add the
  extrapolation after the blend, before the sim to three conversion.
- Off when landed, perched, in the turtle flip, during the crash reset,
  and when the plant's ground clearance is less than the extrapolated
  descent (`__ground().above` is the shell's own reading): the picture
  must never show the quad below the ground the sim says it is on. Off in
  replays and the replay step capture (`tests/replay-test.js` checks the
  buffer holds still across a capture), on the title, and for the harness
  draw off path. A Settings row under Screen, on by default, so a pilot
  who dislikes it can turn it off and a report can say whether it was on.
- The chase cars, the ghost and the cars keep their own poses: their
  relative error over a frame is a few millimetres and extrapolating them
  too doubles the code for nothing.
- The manga layer's impact frame and the lens shake read `stateCurr` and
  are not touched.

Prove it. A unit run: a synthetic state with constant velocity and rate,
drawn twice a frame apart, moves by exactly velocity times the horizon and
rotates by exactly the rate times the horizon. `npm run replay:test` (the
capture holds still), `npm run lint:attract`, `npm run verify` with every
value unchanged (no physics moved), and the shots of a lap with the row on
and off, which should be indistinguishable in a still. What proves the
latency is the owner: Input to screen does not measure this (it measures
the browser's own pipeline), so the test is the sticks. Fly it.

### P3.2. Read the radio over WebHID, not the Gamepad API (up to 16 ms)

What. Chrome samples gamepads on its own 16 ms timer whatever the page's
poll rate, so a stick move can sit 16 ms before the page can see it,
eight on average. WebHID delivers the radio's own USB reports as events at
the radio's rate, and a Radiomaster or any EdgeTX radio enumerates as a
plain HID joystick. Chrome and Edge only; the WebHID blocklist protects
keyboards, mice and FIDO keys, not joysticks.

Gate. Do this only if the owner's next report says `stick.flight.padHzMax`
is near 60 with the radio: that is the number that says Chrome's timer is
the bottleneck. Near 250 or above, skip it.

Fix.
- A second radio source in `src/input/input.js`, named the way the sources
  are named ("a radio over USB"), beside the Gamepad one, never replacing
  it: the Gamepad API stays the default and the fallback.
- Settings, Sticks: a row with a button, because `navigator.hid.
  requestDevice` needs a click; filter on usage page 1, usages 4 and 5
  (joystick, gamepad). On later boots `navigator.hid.getDevices()` reopens
  a granted device with no prompt.
- Parse the report descriptor from `device.collections` (each input
  report's items carry usage, bit size, logical min and max) rather than
  hard coding EdgeTX's layout; `inputreport` events give a DataView. Axes
  become channels through the same calibration flow the Gamepad path uses,
  and the calibration is per source, since the HID axis order is not the
  Gamepad API's.
- Each report is one sample on the existing timestamped queue, so the
  physics and the RC grid see nothing new. `padHz` counts reports.
- Linux needs a udev rule for hidraw access; show the one line in the row's
  note when `requestDevice` returns nothing. Say plainly in the note which
  browsers can.

Prove it. `npm run input:selftest` with a captured EdgeTX report descriptor
and a few captured reports as fixtures; `npm run lint:input`; the
verify-flight-model procedure, with the trace unchanged (the source only
makes samples); the owner's `padHzMax` before and after.

Update, 2026-09-28. The premise above, that Chrome refreshes a pad on a
16 ms timer, does not hold for most pilots: 26 of the 30 open feel
reports flown on a radio in Chrome or Edge carry a `padHzMax` of 125 to
242 Hz, median 193, and four read 22 to 64. By this item's own gate that
is a skip for most, and the owner's own reading is still the one that
decides it for the owner's laptop. PROGRESS.md, the P3.3 entry.

### P3.3. The radio link's own quantisation in the plant (a few ms, the owner's)

What. The shell resamples sticks onto a 250 Hz RC grid (`RC_HZ` in
`src/main.js`), two milliseconds on average; 500 would halve it. And
Betaflight's RC smoothing is compiled in and live in the catalog
(`rc_smoothing_mode`, `rc_smoothing_auto_factor_rpy`, `rc_smoothing_
setpoint_cutoff` and the rest), adding its filter delay exactly as a real
quad does.

Not a change to make. Both alter what the controller sees, so both move
the trace: `RC_HZ` sets the RC frame interval feedforward and smoothing
read, and the smoothing settings are the tune. That is a physics visible
change under CLAUDE.md, and the feel accuracy they buy is the project's
whole goal. Put it to the owner as a question: does a few milliseconds
justify a link the real quad does not have? The smoothing settings the
owner can already try alone, in the FC configurator screen, and say
whether the feel is worth it. If the owner says yes to 500 Hz, it goes
through the verify-flight-model procedure with the new hash recorded as a
deliberate change.

Answered, 2026-09-28: the owner asked for "whatever will deliver a more
locked in feeling". Measured before changing anything
(`npm run feel:response`, the real module at the pad rates the reports
show): 500 Hz is 1 to 4 ms slower on a fast flick at 180 to 250 Hz pads,
because the controller is handed repeated frames, and lighter smoothing
buys about 1 ms. Neither was changed. The lever that moves the feel is
feedforward, the PIDs screen's Stick response slider, which is the
pilot's and was put to the owner rather than made the default.
PROGRESS.md, the P3.3 entry, has the table.

### P3.4. A render loop without vsync (uncertain, real hardware only)

What. With the canvas desynchronized, driving the draw from a timer instead
of requestAnimationFrame could present a frame as soon as the GPU finishes
it, like a game with vsync off: about 8 ms average less, with tearing.
Whether Chrome actually presents an off rAF frame before the next vsync is
not known and cannot be tested in a container.

Fix, as an experiment. Behind a URL flag (`?loop=timer`), never on by
default: a `setTimeout` loop at the display period minus the GPU's
measured time, drawing the same frame body. The contract holds as it does
today: the accumulator takes the loop's capped dt, physics never reads
frame time. Measure with Input to screen on the owner's laptop, flag on
against off, twenty presses each. If the number does not move, Chrome
presents at vsync regardless and the code comes out again. Do not merge it
without the number.

### P3.5. Hardware, which beats all of the above (for the owner)

A 120 or 144 Hz display halves two terms of the chain at once, the wait
for the consuming frame and the vsync after the draw, about 12 to 16 ms
together. An external gaming monitor removes most of a laptop panel's own
20 to 30 ms. A wired radio on a port with no hub matters less. None of
this is code; it belongs in the wiki's page on latency if one is written,
and in the Input to screen note ("at 60 Hz a frame is 17 ms of this").

### Not worth doing for latency

Physics in a worker: it isolates the sim from menu and GC jank, which is
Stage 2's reason for it, and removes nothing from the chain. Polling the
sticks faster than 2 ms: the browser's own sampling is the floor. A
throwaway forward simulation to predict the dynamics as well as the pose:
it needs a state snapshot added to the module ABI for a gain P3.1 already
has to within a few millimetres.

## What this review could not see

Real frame rates, photon latency, whether Linux or Windows Chrome honours
`desynchronized` in effect rather than in attribute, tearing, and the feel.
None of those can be verified in the container and none should be claimed.
