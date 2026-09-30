/*
 * padgate.js: when a radio may drive a menu that opened under its hands.
 *
 * WHY THIS EXISTS. bug-2d93629e, a RadioMaster TX15 on Edge in fullscreen:
 * "When pausing a game to change setting, the interface/menu is displayed for
 * a second then the resume is automatically selected or clicked and the game
 * resumes." Expected: "does not receive false events."
 *
 * The menus are driven by the same channels that fly the quad. padNav in
 * main.js reads roll past NAV_DEFLECT as right, which selects, and left,
 * which goes back, and pollPad in ui.js turns each fresh crossing into an
 * action. The only protection was an edge detector and one poll of seeding
 * when a screen opens (see show() in ui.js), which covers a stick already
 * held at that instant and nothing after it. The pause menu is the worst
 * place to be that trusting: it opens because the pilot reached for the
 * keyboard with a radio in their hands, the cursor starts on Resume, and both
 * select and back are Resume there.
 *
 * REPRODUCED, on 30 September, in the real shell with a synthetic TX15 (eight
 * axes, 24 buttons, calibrated, flying, then Escape, then what a hand does):
 *
 *   sticks all at rest, throttle at hover, noise, aux switch flips,
 *   roll held when the menu opened and let go, pitch held   stayed paused
 *   roll released with an overshoot to -0.6 at 230 ms       resumed at 247 ms
 *   a bump right or left at one second                      resumed at 1.02 s
 *   a switch on button 0 or 1 pressed at 0.8 to 1 s         resumed
 *
 * Each resume was Ui.pollPad calling select or back. That is the ticket, down
 * to "a second". Which of them the TX15 produced is not knowable from the
 * report; every one is something a person does with a radio in one hand.
 *
 * THE RULE, for a menu that opens FROM FLIGHT and for the rest of that visit
 * to the menus (until the pilot is in the air again or on the title):
 *
 *   1. SETTLE. The radio is not listened to until the sticks have been at
 *      rest, roll and pitch inside PAD_CALM, for PAD_SETTLE_MS in a row. Any
 *      movement starts the count again. This swallows the release, the
 *      overshoot and the readjusting of a grip.
 *   2. DWELL. After that, roll has to be held PAD_DWELL_MS to count as right
 *      or left, which is select, back or an adjustment. A bump is over in far
 *      less; a person pushing on purpose holds it until the menu answers. The
 *      cursor (up and down) and the buttons are not held: moving the cursor
 *      changes nothing, and a button is a discrete act the radio makes.
 *
 * A menu reached from the title is not opened under the pilot's hands, so it
 * keeps the instant flick that scripts/input-check.js section 5c pins.
 *
 * WHAT IT DOES NOT DO. It does not stop a switch on buttons 0 to 3 flipped
 * after the settle: those are menu keys by design, so that Fly is one flick
 * away, and nothing separates a flip on purpose from one made by habit. It
 * does not stop a radio lying on its sticks: a held stick is a hold. Both
 * would need the shell to know the pilot last used the keyboard or mouse and
 * to make the radio take over with a gesture of its own, which is a larger
 * change and is the next step if reports continue.
 *
 * The numbers are reasoned, not measured: half a second is longer than any
 * release, overshoot or regrip the reproduction could make and short enough
 * that a Results screen answers before anyone has looked at it; a fifth of a
 * second is longer than a bump and shorter than a push. The owner may tune.
 *
 * Plain data and plain functions, with no clock of their own: ui.js hands in
 * the time since the last poll, already clamped, so a stalled frame or a tab
 * coming back cannot bank quiet it never saw, and scripts/input-selftest.js
 * can step it by hand. This is the menus, not the physics path.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* Roll and pitch count as at rest inside this, in channel units. Well inside
 * NAV_DEFLECT, so a stick sitting at half travel is not quiet. */
export const PAD_CALM = 0.3;
/* How long the sticks must stay at rest before a menu opened from flight
 * listens to the radio. */
export const PAD_SETTLE_MS = 500;
/* How long roll must be held to count as right or left. */
export const PAD_DWELL_MS = 200;

/* The most one poll may be credited with. A stalled frame, a fullscreen
 * change or a tab coming forward arrives with a long gap, and quiet that was
 * not seen is not quiet. */
export const PAD_DT_MAX_MS = 100;

/* The time since the last poll, clamped, or 0 for the first. */
export function padDtMs(lastAt, nowMs) {
  return lastAt ? Math.min(PAD_DT_MAX_MS, Math.max(0, nowMs - lastAt)) : 0;
}

export function newPadGate() {
  return {
    hot: false, settling: false, quietMs: 0, rightMs: 0, leftMs: 0,
  };
}

/* A menu is opening from flight: the radio is still in the pilot's hands. */
export function openPadGate(g) {
  g.hot = true;
  g.settling = true;
  g.quietMs = 0;
  g.rightMs = 0;
  g.leftMs = 0;
}

/* The exposed stretch is over: the pilot is in the air, or on the title. */
export function closePadGate(g) {
  g.hot = false;
  g.settling = false;
  g.quietMs = 0;
  g.rightMs = 0;
  g.leftMs = 0;
}

/*
 * One poll. `now` is this frame's { up, down, left, right, select, back };
 * `calm` says whether roll and pitch are at rest; `dtMs` is the time since
 * the last poll.
 *
 * Returns false while the radio is not being listened to, and leaves `now`
 * as it is so the caller can seed its edge tracker from it. Returns true when
 * the caller may act, having rewritten `now.right` and `now.left` to the
 * ones that have been held long enough. A gate that is not open is a
 * pass through.
 */
export function stepPadGate(g, now, calm, dtMs) {
  if (!g.hot) {
    return true;
  }
  if (g.settling) {
    g.quietMs = calm ? g.quietMs + dtMs : 0;
    if (g.quietMs < PAD_SETTLE_MS) {
      return false;
    }
    g.settling = false;
  }
  g.rightMs = now.right ? g.rightMs + dtMs : 0;
  g.leftMs = now.left ? g.leftMs + dtMs : 0;
  now.right = g.rightMs >= PAD_DWELL_MS;
  now.left = g.leftMs >= PAD_DWELL_MS;
  return true;
}
