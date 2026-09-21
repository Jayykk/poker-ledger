/**
 * Pure helpers for the "photo → AI → cards" feature.
 *
 * Nothing in here touches Firebase or the network so it can be unit-tested
 * in jsdom. The composable in src/composables/useCardRecognition.js wires
 * these into the Firebase AI Logic (Gemini) SDK.
 */
import { SUITS, RANKS, CARD_LIMITS } from './constants.js';

/** Gemini model used for recognition. Override with VITE_GEMINI_MODEL. */
export const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.7-flash';

/** Suit names the model is asked to emit (lower-case English). */
export const RECOGNITION_SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

const SUIT_NAME_TO_SYMBOL = {
  spades: SUITS.SPADES,
  hearts: SUITS.HEARTS,
  diamonds: SUITS.DIAMONDS,
  clubs: SUITS.CLUBS
};

// Accept symbols and single letters too, so a slightly off-schema answer still parses.
const SUIT_ALIASES = {
  '♠': 'spades', s: 'spades', spade: 'spades',
  '♥': 'hearts', h: 'hearts', heart: 'hearts',
  '♦': 'diamonds', d: 'diamonds', diamond: 'diamonds',
  '♣': 'clubs', c: 'clubs', club: 'clubs'
};

const RANK_ALIASES = { T: '10' };

export const RECOGNITION_ERROR = {
  NO_CARDS: 'noCards',
  PARSE_FAILED: 'parseFailed',
  APP_CHECK: 'appCheck',
  QUOTA: 'quota',
  BILLING: 'billing',
  API_NOT_ENABLED: 'apiNotEnabled',
  NETWORK: 'network',
  IMAGE: 'image',
  UNKNOWN: 'unknown'
};

export class CardRecognitionError extends Error {
  /**
   * @param {string} code One of RECOGNITION_ERROR
   * @param {unknown} [cause] Original error, if any
   */
  constructor(code, cause) {
    super(code);
    this.name = 'CardRecognitionError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Plain SchemaRequest object accepted by firebase/ai's `responseSchema`.
 * Kept as a literal so this module never imports firebase/ai.
 */
export const CARD_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rank: { type: 'STRING', format: 'enum', enum: [...RANKS] },
          suit: { type: 'STRING', format: 'enum', enum: [...RECOGNITION_SUIT_NAMES] },
          group: { type: 'INTEGER' },
          confidence: { type: 'NUMBER' }
        },
        required: ['rank', 'suit', 'group']
      }
    },
    communityGroup: { type: 'INTEGER', nullable: true }
  },
  required: ['cards']
};

export const CARD_RECOGNITION_PROMPT = `You are reading a photo of a poker table with physical playing cards.
Identify every playing card that is FACE UP and clearly legible. The photo may be taken top-down or at an angle.
Rules:
- Output ONLY cards whose rank and suit you can read with confidence. Skip face-down cards, partially hidden cards, chips, dealer buttons and anything that is not a playing card.
- Ranks: A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K. Write ten as "10" (never "T").
- Suits: spades (black ♠), hearts (red ♥), diamonds (red ♦), clubs (black ♣). Use the corner index and the pip shape; do not guess a suit from colour alone.
- Do not list the same card twice. A standard deck has exactly one of each card.
- Group cards by physical placement: cards that are stacked, overlapping, or lying right next to each other as one set share the same "group" number (1, 2, 3, ...). Separate piles get separate numbers. A player's hole cards are usually a pair of 2 cards; the community board is usually 3 to 5 cards laid out in a single line.
- If you can identify the community board (the single row of 3 to 5 cards, typically in the middle of the table), put its group number in "communityGroup"; otherwise use null.
- If no cards are legible, return an empty list.
Respond with JSON only: {"communityGroup":1,"cards":[{"rank":"A","suit":"spades","group":1,"confidence":0.95}]}`;

const stripFences = (text) => text
  .replace(/^\s*```(?:json)?\s*/i, '')
  .replace(/\s*```\s*$/, '')
  .trim();

/**
 * Parse the model's text response into JSON. Tolerates ```json fences and
 * prose around the JSON payload.
 * @param {string} text
 * @returns {unknown}
 * @throws {CardRecognitionError} PARSE_FAILED
 */
export function parseGeminiJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new CardRecognitionError(RECOGNITION_ERROR.PARSE_FAILED);
  }
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to substring extraction
  }
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  const starts = [objStart, arrStart].filter((i) => i >= 0);
  if (starts.length > 0) {
    const start = Math.min(...starts);
    const closer = cleaned[start] === '{' ? '}' : ']';
    const end = cleaned.lastIndexOf(closer);
    if (end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Give up below
      }
    }
  }
  throw new CardRecognitionError(RECOGNITION_ERROR.PARSE_FAILED);
}

const normalizeRank = (value) => {
  if (value === undefined || value === null) return null;
  const rank = String(value).trim().toUpperCase();
  const mapped = RANK_ALIASES[rank] || rank;
  return RANKS.includes(mapped) ? mapped : null;
};

const normalizeSuit = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  const suit = SUIT_ALIASES[raw] || SUIT_ALIASES[lower] || lower;
  return RECOGNITION_SUIT_NAMES.includes(suit) ? suit : null;
};

const toGroupId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Convert the model's JSON into the app's card strings plus grouping info.
 *
 * - Invalid entries are dropped, duplicates removed, order preserved.
 * - Groups are renumbered 1..n in order of first appearance; cards the model
 *   left ungrouped each get their own new group.
 * - `communityGroup` is remapped to the new numbering, or null if it does not
 *   point at an existing group.
 *
 * @param {unknown} raw `{ cards: [...], communityGroup? }` or a bare array
 * @returns {{ cards: Array<{ card: string, group: number }>, communityGroup: number | null }}
 */
export function normalizeRecognition(raw) {
  const isObj = raw && typeof raw === 'object' && !Array.isArray(raw);
  const list = Array.isArray(raw) ? raw : (isObj && Array.isArray(raw.cards)) ? raw.cards : [];
  const rawCommunityGroup = isObj ? toGroupId(raw.communityGroup) : null;

  const seen = new Set();
  const groupMap = new Map(); // model group id -> renumbered id
  let nextGroup = 1;
  const cards = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const rank = normalizeRank(entry.rank);
    const suit = normalizeSuit(entry.suit);
    if (!rank || !suit) continue;
    const card = rank + SUIT_NAME_TO_SYMBOL[suit];
    if (seen.has(card)) continue;
    seen.add(card);

    const modelGroup = toGroupId(entry.group);
    let group;
    if (modelGroup !== null) {
      if (!groupMap.has(modelGroup)) groupMap.set(modelGroup, nextGroup++);
      group = groupMap.get(modelGroup);
    } else {
      group = nextGroup++;
    }
    cards.push({ card, group });
  }

  const communityGroup = rawCommunityGroup !== null && groupMap.has(rawCommunityGroup)
    ? groupMap.get(rawCommunityGroup)
    : null;

  return { cards, communityGroup };
}

/**
 * Convert the model's JSON into the app's card strings ("A♠", "10♥") only.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeRecognizedCards(raw) {
  return normalizeRecognition(raw).cards.map((c) => c.card);
}

/**
 * Pick the group that should be pre-assigned to the community board.
 *
 * Prefers the model's `communityGroup` when it has 3-5 cards. Otherwise, if
 * exactly one group has 3-5 cards and every other group has at most 2 (hole
 * cards), that group is the board. Returns null when unsure.
 *
 * @param {{ cards: Array<{ card: string, group: number }>, communityGroup: number | null }} recognition
 * @param {{ COMMUNITY_MAX: number, PLAYER_HAND_MAX: number }} [limits]
 * @returns {number | null}
 */
export function suggestCommunityGroup(recognition, limits = CARD_LIMITS) {
  const sizes = new Map();
  for (const { group } of recognition?.cards || []) {
    sizes.set(group, (sizes.get(group) || 0) + 1);
  }
  const isBoardSized = (n) => n >= 3 && n <= limits.COMMUNITY_MAX;

  const hinted = recognition?.communityGroup;
  if (hinted !== null && hinted !== undefined && isBoardSized(sizes.get(hinted) || 0)) {
    return hinted;
  }

  const boardCandidates = [...sizes.entries()].filter(([, n]) => isBoardSized(n));
  if (boardCandidates.length !== 1) return null;
  const othersAreHands = [...sizes.entries()]
    .filter(([g]) => g !== boardCandidates[0][0])
    .every(([, n]) => n <= limits.PLAYER_HAND_MAX);
  return othersAreHands ? boardCandidates[0][0] : null;
}

const statusOf = (err) => err?.customErrorData?.status ?? err?.status ?? err?.httpStatus;

/**
 * Map any thrown error to a RECOGNITION_ERROR code (used as an i18n key suffix).
 * @param {unknown} err
 * @returns {string}
 */
export function mapAiError(err) {
  if (err instanceof CardRecognitionError) return err.code;
  if (!err) return RECOGNITION_ERROR.UNKNOWN;

  const code = typeof err.code === 'string' ? err.code.toLowerCase() : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const status = statusOf(err);

  if (code.endsWith('api-not-enabled')) return RECOGNITION_ERROR.API_NOT_ENABLED;
  if (/prepay|credits? (?:are|is) depleted|billing/i.test(message)) return RECOGNITION_ERROR.BILLING;
  if (status === 429 || /quota|resource.?exhausted|rate.?limit/i.test(message)) return RECOGNITION_ERROR.QUOTA;
  if (status === 401 || status === 403 || /app\s?check/i.test(message)) return RECOGNITION_ERROR.APP_CHECK;
  if (code.endsWith('fetch-error') || err instanceof TypeError || /failed to fetch|network/i.test(message)) {
    return RECOGNITION_ERROR.NETWORK;
  }
  return RECOGNITION_ERROR.UNKNOWN;
}

/**
 * Merge recognised cards into a hand record without mutating it.
 *
 * - Appends to the existing arrays.
 * - A card already anywhere in the record is skipped.
 * - Respects COMMUNITY_MAX / PLAYER_HAND_MAX.
 * - Ignores non-participating or unknown playerIds.
 *
 * @param {{ communityCards: string[], players: Array<{playerId: string, participating?: boolean, cards?: string[]}> }} handRecord
 * @param {{ communityCards?: string[], playerCards?: Record<string, string[]> }} assignments
 * @param {{ COMMUNITY_MAX: number, PLAYER_HAND_MAX: number }} [limits]
 * @returns {{ communityCards: string[], players: Array<object>, appliedCount: number }}
 */
export function applyAssignments(handRecord, assignments = {}, limits = CARD_LIMITS) {
  const { communityCards: newCommunity = [], playerCards = {} } = assignments;
  const used = new Set(handRecord.communityCards || []);
  for (const p of handRecord.players || []) {
    if (p.participating !== false) (p.cards || []).forEach((c) => used.add(c));
  }

  let appliedCount = 0;
  const take = (existing, incoming, max) => {
    const result = [...existing];
    for (const card of incoming || []) {
      if (result.length >= max) break;
      if (used.has(card)) continue;
      used.add(card);
      result.push(card);
      appliedCount += 1;
    }
    return result;
  };

  const communityCards = take(handRecord.communityCards || [], newCommunity, limits.COMMUNITY_MAX);
  const players = (handRecord.players || []).map((p) => {
    const incoming = playerCards[p.playerId];
    if (!incoming || p.participating === false) return { ...p, cards: [...(p.cards || [])] };
    return { ...p, cards: take(p.cards || [], incoming, limits.PLAYER_HAND_MAX) };
  });

  return { communityCards, players, appliedCount };
}
