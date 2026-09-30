/*
 * start.js: the track builder's first module.
 *
 * It was the inline module at the foot of index.html, and it moved here
 * unchanged when src/fresh.js started loading every page's scripts: the
 * builder's page asks for its deploy, has fresh.js write the import map,
 * and fresh.js imports this, once the page is parsed. An inline module
 * would have started the module loader before the import map was written.
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

import { App, docFromLocation } from './app.js';
import { docFromHash } from './sharelink.js';
import { duplicateTrack } from './model.js';
import { pingVisit } from '../share/stats.js';

/*
 * FIRST, BEFORE ANYTHING READS THE QUERY. It takes a sponsor's
 * utm_source out of the address and puts it away, takes every utm_
 * parameter out of the address bar so a shared ?track= link does not
 * carry somebody else's poster, and counts one visit per browser per
 * UTC day across all three pages. It sends nothing at all when the
 * pilot has switched counting off on the board, or when their browser
 * sends Global Privacy Control. Nothing waits for it.
 */
pingVisit('builder');

/* One canvas for the elevation chart, created once and re-appended by
   the results panel on every render. */
const profile = document.createElement('canvas');
profile.id = 'tb-profile';

const app = new App({
  topbar: document.getElementById('tb-topbar'),
  palette: document.getElementById('tb-palette'),
  canvas2d: document.getElementById('tb-2d'),
  canvas3d: document.getElementById('tb-3d'),
  inspector: document.getElementById('tb-inspector'),
  sequence: document.getElementById('tb-sequence'),
  results: document.getElementById('tb-results'),
  profile,
  readout: document.getElementById('tb-readout'),
  /* The whoop canvas's chrome over the room: see ui.js. */
  card: document.getElementById('tb-card'),
  empty: document.getElementById('tb-empty'),
  coach: document.getElementById('tb-coach'),
  lapbar: document.getElementById('tb-lapbar'),
  toast: document.getElementById('tb-toast'),
  modal: document.getElementById('tb-modal'),
});

/* A track passed in the URL wins over the autosave, so a link to a
   track opens that track. A published course from the board, or an
   Edit a copy intent from the simulator, is adopted after that, and
   a published map from the board's Remix in the builder after that. */
const linked = docFromLocation();
if (linked) {
  /* Kept, not asked: a link opens that track, and what it displaces goes into
     Load. See openIncoming in app.js. */
  app.openIncoming(linked, `Opened "${linked.name}" from the link.`);
}
/* A #track= link carries the whole track in the fragment (sharelink.js). It opens
   as a copy, under a new id, so nothing done to it is done to the track the link
   was made from, and the fragment is taken out of the address so that a reload
   does not open it again over whatever was done since. */
if (!linked && /(^#|&)track=/.test(window.location.hash)) {
  const shared = await docFromHash(window.location.hash);
  if (shared) {
    app.openIncoming(duplicateTrack(shared, shared.name), 'A shared track. Editing makes your copy.');
  } else {
    /* A link that is not one of ours, or was cut short in a chat, or was made by
       a browser that can deflate for one that cannot: the pilot pressed it and
       nothing would happen, so say why. */
    app.toast('That share link could not be opened. It looks cut short or damaged, or it was made by a browser that this one cannot read.');
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
await app.adoptIncomingShare();
await app.adoptIncomingMap();

window.trackBuilder = app;
