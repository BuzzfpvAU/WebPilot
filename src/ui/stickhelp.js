/*
 * stickhelp.js: what the Stick help screen says, and where a stick that
 * does nothing is being lost.
 *
 * WHY THIS EXISTS. The owner, 28 September 2026: the board kept getting
 * tickets saying a controller could not yaw, or pitch, or throttle, and
 * nothing in any of them could say whether the pilot's radio was set up
 * wrong or the sim was. Read against the reports' own context, the answer
 * was mostly neither:
 *
 *   phones      nine tickets, every one about yaw or throttle. Chrome on
 *               Android hands a page four axes from a radio it does not
 *               recognise and drops the rest, and a radio in AETR order
 *               puts throttle and yaw on the two axes that compete for one
 *               of the four. No calibration anywhere can bring a dropped
 *               axis back. See fourAxisPad in src/input/input.js.
 *   Firefox     both Linux tickets. It calls an EdgeTX radio a gamepad and
 *               moves its axes. See firefoxRadio in src/input/input.js.
 *   desktops    mostly a radio flown on the built in guess of the channel
 *               order, which the wizard fixes in a minute.
 *   Safari      a radio never seen at all.
 *
 * So the screen does not start with instructions. It starts with the one
 * question that splits every cause into two piles, asked while the pilot's
 * hand is on the stick: move the stick that is not working, does any bar
 * move? If one does, the browser has it and the sim is reading it wrong,
 * and the wizard fixes that. If none does, the stick never reached the
 * browser, nothing in any page can fix it, and what can is the radio, the
 * operating system or the browser, which is what the block under the bars
 * says for the platform the pilot is on.
 *
 * Plain functions of plain data, so scripts/input-selftest.js can read every
 * sentence without a browser. The DOM is src/ui/ui.js's; the axes are
 * input.js's stickCheckView.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * WHICH MACHINE THE PILOT IS HOLDING, as far as the advice cares.
 *
 * `env` is what the browser says about itself: userAgent, the User-Agent
 * Client Hints platform where there is one, maxTouchPoints, and whether the
 * primary pointer is coarse. Passed in rather than read here, so a test can
 * be any machine.
 *
 * THE PHONE THAT SAYS IT IS A LINUX DESKTOP. Chrome on Android asked for the
 * desktop site sends "X11; Linux x86_64", and four of the nine phone tickets
 * came that way; only their GPUs, Adreno and Mali, gave them away. A coarse
 * primary pointer is the tell available here: a Linux laptop with a touch
 * screen still points with its touchpad, a phone points with a finger.
 */
export function stickPlatform(env = {}) {
  const ua = String(env.userAgent || '');
  const p = String(env.uaPlatform || '');
  const touch = Number(env.maxTouchPoints) || 0;
  if (/android/i.test(p) || /Android/.test(ua)) {
    return 'android';
  }
  /* iPadOS asks for the desktop site by default and says Macintosh, with
   * touch points no Mac has. */
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) {
    return 'ios';
  }
  if (/windows/i.test(p) || /Windows/.test(ua)) {
    return 'windows';
  }
  if (/chrome ?os/i.test(p) || /CrOS/.test(ua)) {
    return 'chromeos';
  }
  if (/mac/i.test(p) || /Macintosh|Mac OS X/.test(ua)) {
    return 'mac';
  }
  if (/linux/i.test(p) || /Linux/.test(ua)) {
    return env.coarse ? 'android' : 'linux';
  }
  return 'other';
}

/* Which browser, for the two whose own behaviour the advice names. */
export function stickBrowser(userAgent = '') {
  const ua = String(userAgent);
  if (/Firefox\//.test(ua)) {
    return 'firefox';
  }
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return 'safari';
  }
  return 'chromium';
}

export function capital(word) {
  const w = String(word || '');
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

/* "yaw", "yaw and throttle", "roll, pitch and yaw". */
export function channelList(channels) {
  const c = (channels || []).slice();
  if (c.length <= 1) {
    return c[0] || '';
  }
  const last = c.pop();
  return `${c.join(', ')} and ${last}`;
}

/*
 * THE LINE A FLYING PILOT SEES, once per channel per page, in the banner:
 * short, because it is read over a moving picture, and it names the one
 * thing to do, because the pilot has both hands on a radio. See main.js,
 * noteLostSticks.
 */
export function lostStickNotice(channel) {
  return `${capital(channel)} is not reaching the sim.\nPause for Stick help.`;
}

/*
 * THE LIVE SENTENCE UNDER THE BARS: what the pilot's hand just did, read
 * for them. First match wins, and the order is the order of certainty: a
 * missing axis is a fact about the map, a stick moving that nothing reads
 * is a fact about this second, and everything after that is waiting for
 * the pilot to try.
 */
export function stickSay(view, platform = 'other') {
  const v = view || {};
  if (!v.pad) {
    return 'No radio or gamepad is reaching this browser yet. Plug it in, set it to joystick'
      + ' mode and move a stick: a browser shows a pad to a page only once something on it moves.';
  }
  const missing = v.missing || [];
  if (missing.length) {
    return `Your saved calibration reads ${channelList(missing)} from an axis this pad does not have,`
      + ` so ${missing.length > 1 ? 'they read' : 'it reads'} nothing. It has ${v.axisCount}.`
      + ' Calibrate sticks maps it again from what it actually sends.';
  }
  const m = v.moving;
  if (m && !m.channel) {
    const stick = (v.strays || []).includes(m.axis);
    return stick
      ? `Axis ${m.axis} is moving like a stick, and nothing in the sim reads it. The browser has your`
        + ' stick; the sim has it on the wrong channel. Calibrate sticks fixes that in about a minute.'
      : `Axis ${m.axis} is moving, and nothing in the sim reads it. If that is the stick that is not`
        + ' working, Calibrate sticks puts it on the right channel.';
  }
  if (m && m.channel) {
    return `That is ${m.channel}, on axis ${m.axis}, and it is reaching the sim.`;
  }
  const strays = v.strays || [];
  if (strays.length) {
    const which = strays.length > 1 ? `Axes ${channelList(strays.map(String))}` : `Axis ${strays[0]}`;
    return `${which} moved like a stick, and nothing in the sim reads ${strays.length > 1 ? 'them' : 'it'}.`
      + ' That is a stick on the wrong channel, and Calibrate sticks fixes it.';
  }
  const dead = v.dead || [];
  if (dead.length) {
    const where = platform === 'android' && v.fourAxes
      ? ' This phone is passing on four of your radio\'s axes, so if no bar moves, Chrome is dropping it.'
      : '';
    return `${capital(channelList(dead))} did not move once in flight. Move ${dead.length > 1 ? 'those sticks' : 'that stick'}`
      + ` now and watch the bars.${where}`;
  }
  return 'Move the stick that is not working, all the way to each end, and watch the bars.';
}

/*
 * THE RADIO'S HALF, which is the same on every machine: the mode it is in
 * and the model it is on. A model decides what each channel sends, and a
 * new or empty one can send nothing on a stick, which from here looks
 * exactly like a stick that is not there.
 */
const RADIO_LINE = 'On the radio: choose USB joystick mode as you plug it in, before opening this page,'
  + ' and check the model selected on it. The model decides what each channel sends, and a new or'
  + ' empty one can send nothing on a stick.';

/*
 * IF NO BAR MOVES, for the machine the pilot is on. Each is what can
 * actually be done there, in the order a pilot should try it, and says
 * plainly where this page can do nothing.
 *
 * THE ANDROID PARAGRAPH'S SECOND HALF IS WORKED OUT, NOT TRIED. Chrome's
 * fallback keeps X and Y, one of Z and Rx, and one of Ry and Rz, so a radio
 * that sends its four sticks on X, Y, Z and Rz and nothing else on an axis
 * should arrive whole, and in AETR order, which is the order this page
 * guesses. Nobody has flown that on a phone yet, so the sentence says
 * "should" and asks to be told, and the report it asks for carries the
 * axis list that would settle it.
 */
export function platformHelp(platform, browser = 'chromium', facts = {}) {
  const four = facts.fourAxes ? ` Your radio is arriving as ${facts.axisCount || 4} axes.` : '';
  if (platform === 'android') {
    return {
      title: 'If no bar moves: Android',
      lines: [
        'Chrome on Android passes on only four axes from a radio and drops the rest, and one of'
          + ' your four sticks can be among the dropped, most often throttle or yaw. When that is'
          + ` what happened, nothing in this page or any other can bring it back, calibrating included.${four}`,
        'The sure fix is a computer, which sees every axis. If your radio lets you choose which axis'
          + ' each channel is sent on (EdgeTX does, in its USB joystick settings in Advanced mode),'
          + ' sending the four sticks on X, Y, Z and rotZ, with nothing else on an axis, should get'
          + ' all four through. If you try it, say whether it worked with Report a bug from this screen.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'windows') {
    return {
      title: 'If no bar moves: Windows',
      lines: [
        'Check whether Windows sees the stick: press Windows and R, type joy.cpl, press Enter, pick'
          + ' your radio and open Properties, then move it. If it moves there and not here, report a'
          + ' bug from this screen and say so.',
        'If it does not move there either, the radio is not sending it. Calibrating in that Windows'
          + ' window changes nothing a browser reads, so there is no need to.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'mac') {
    return {
      title: 'If no bar moves: Mac',
      lines: [
        ...(browser === 'safari'
          ? ['Safari may not hand a radio to a page at all. Try Chrome, Edge or Firefox before anything else.']
          : []),
        'macOS has no stick test of its own, so these bars are the test. If a stick moves here in one'
          + ' browser and not in another, report a bug from this screen and say which.',
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'linux') {
    return {
      title: 'If no bar moves: Linux',
      lines: [
        'jstest-gtk or evtest shows what the radio is sending. If the stick moves there and not'
          + ' here, report a bug from this screen and say so.',
        ...(browser === 'firefox'
          ? ['Firefox calls many radios a gamepad and moves their axes around. EdgeTX and OpenTX'
            + ' radios are read the way Firefox lays them out; for anything else, Calibrate sticks'
            + ' sorts it out, or try Chrome.']
          : []),
        RADIO_LINE,
      ],
    };
  }
  if (platform === 'ios') {
    return {
      title: 'If no bar moves: iPhone and iPad',
      lines: [
        'Safari on iPhone and iPad hands a page only the game controllers it knows, and a radio is'
          + ' usually not one of them. A computer or an Android phone will see it.',
        RADIO_LINE,
      ],
    };
  }
  return {
    title: 'If no bar moves',
    lines: [
      `Then the stick is not reaching this browser, and nothing in this page can change that.${four}`,
      RADIO_LINE,
    ],
  };
}
