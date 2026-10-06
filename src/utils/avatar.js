// Avatar image of a room / roster player without extra reads: the seat's own
// `avatar` (session rosters carry one), else your own photo on your own seat.
// Empty string → PlayerAvatar shows the name's initial.

/**
 * @param {?object} player Roster / room player ({ uid, avatar? }).
 * @param {?object} me Signed-in user ({ uid, photoURL }).
 * @return {string}
 */
export function avatarSrcOf(player, me) {
  if (player?.avatar) return player.avatar;
  if (player?.uid && me?.uid && player.uid === me.uid) return me.photoURL || '';
  return '';
}
