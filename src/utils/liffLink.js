/**
 * LIFF link to a page of the app (path without the leading slash, may carry
 * its own ?query).
 *
 * The page rides in ?__path= instead of the URL path. LIFF redirects
 * liff.line.me/ID/game/abc to <endpoint>/game/abc, which GitHub Pages 404s
 * (one more page load through 404.html, then another for its ?__path=
 * hop). liff.line.me/ID/?__path=game%2Fabc lands on index.html directly,
 * and main.js turns ?__path= into the hash route in place.
 */
export function liffLink(liffId, path) {
  const p = String(path || '').replace(/^\/+/, '');
  return `https://liff.line.me/${liffId}/?__path=${encodeURIComponent(p)}`;
}
