/*
 * sharelink.js: a track that travels in an address.
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

import { normalize } from './model.js';

/* A document out of some text, or null: valid JSON that is an object, and
 * nothing else. normalize accepts anything at all, so without this the text
 * "123" would open as an empty track. */
function readDocument(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return normalize(parsed).doc;
}

/*
 * The document a ?track= link carries, or null.
 *
 * DECODED ONCE. URLSearchParams has already undone the percent escapes by the
 * time get() returns, so the value is the JSON itself. Decoding it a second
 * time threw on a name with a percent sign in it, so the link silently opened
 * nothing, and quietly rewrote a name that only looked like an escape ("a%41b"
 * became "aAb"). A link somebody encoded twice by hand (a chat app will do it)
 * is not JSON when read the first time, and is tried once more decoded.
 */
export function docFromQuery(search) {
  const raw = new URLSearchParams(search).get('track');
  if (!raw) {
    return null;
  }
  const once = readDocument(raw);
  if (once) {
    return once;
  }
  let twice = null;
  try {
    twice = decodeURIComponent(raw);
  } catch (e) {
    return null;
  }
  return readDocument(twice);
}
