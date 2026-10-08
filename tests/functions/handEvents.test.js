import { describe, it, expect } from 'vitest';
import {
  toSolverCard, normalizeHandType, handWinners, handScore, streetEquities, classifyShowdown,
  isPremiumStart, handEventsOfHand, gameHandEvents,
} from '../../functions/src/utils/handEvents.js';
import { evaluateHand, compareHands } from '../../functions/src/utils/handEvaluator.js';
import { HAND_EVENT_KEYS } from '../../functions/src/utils/leaderboardStatsMath.js';

// A hand as HandRecordSheet.vue saves it
const hand = (board, players) => ({
  communityCards: board,
  players: players.map(([playerId, cards, extra = {}]) => ({
    playerId, playerName: playerId, cards, handType: '', chips: 0, ...extra,
  })),
});
const W = { winner: true };

describe('cards and hand types', () => {
  it('reads recorded cards in pokersolver notation', () => {
    expect(toSolverCard('A♠')).toBe('As');
    expect(toSolverCard('10♥')).toBe('Th');
    expect(toSolverCard('Q♦')).toBe('Qd');
    expect(toSolverCard('2♣')).toBe('2c');
    expect(toSolverCard('10h')).toBe('Th');
    expect(toSolverCard('Ks')).toBe('Ks');
    for (const junk of ['', '1♠', 'X♠', 'A', 'A?', null, 7]) expect(toSolverCard(junk)).toBeNull();
  });

  it('normalizes recorded hand types', () => {
    expect(normalizeHandType('four_of_a_kind')).toBe('four_of_a_kind');
    expect(normalizeHandType('Four of a Kind')).toBe('four_of_a_kind');
    expect(normalizeHandType('royal_flush')).toBe('royal_flush');
    expect(normalizeHandType('')).toBeNull();
    expect(normalizeHandType('nonsense')).toBeNull();
  });

  it('winners: the flags, else (older records) chips > 0, else unknown', () => {
    expect([...handWinners(hand([], [['a', [], W], ['b', []]]))]).toEqual(['a']);
    expect([...handWinners(hand([], [['a', [], { chips: 300 }], ['b', [], { chips: -300 }]]))]).toEqual(['a']);
    expect(handWinners(hand([], [['a', []], ['b', []]]))).toBeNull();
  });

  it('premium starts: QQ+ or AK', () => {
    expect(isPremiumStart(['Qs', 'Qh'])).toBe(true);
    expect(isPremiumStart(['As', 'Kd'])).toBe(true);
    expect(isPremiumStart(['Kc', 'Ac'])).toBe(true);
    expect(isPremiumStart(['Js', 'Jh'])).toBe(false);
    expect(isPremiumStart(['As', 'Qd'])).toBe(false);
  });
});

describe('handScore orders hands exactly like handEvaluator.js', () => {
  it('agrees with pokersolver on 3000 random showdowns', () => {
    const ranks = '23456789TJQKA';
    const deck = [...ranks].flatMap((r) => [...'shdc'].map((s) => r + s));
    const toInt = (c) => ranks.indexOf(c[0]) * 4 + 'shdc'.indexOf(c[1]);
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 3000; i++) {
      const d = [...deck];
      for (let k = 0; k < 9; k++) {
        const j = k + Math.floor(rand() * (d.length - k));
        [d[k], d[j]] = [d[j], d[k]];
      }
      const board = d.slice(4, 9);
      const expected = compareHands(evaluateHand(d.slice(0, 2), board), evaluateHand(d.slice(2, 4), board));
      const got = Math.sign(handScore([...d.slice(0, 2), ...board].map(toInt))
        - handScore([...d.slice(2, 4), ...board].map(toInt)));
      expect(got, d.slice(0, 9).join(' ')).toBe(expected);
    }
  });
});

describe('final hands', () => {
  it('quads / straight flush / royal from the cards', () => {
    expect(handEventsOfHand(hand(['9♦', '9♣', '2♠', '5♥', 'K♦'], [['a', ['9♠', '9♥'], W], ['b', []]])).a)
      .toMatchObject({ quads: 1 });
    expect(handEventsOfHand(hand(['5♥', '6♥', '7♥', 'K♠', '2♦'], [['a', ['8♥', '9♥'], W], ['b', []]])).a)
      .toEqual({ straightFlush: 1 });
    const royal = handEventsOfHand(hand(['Q♠', 'J♠', '10♠', '2♦', '3♣'], [['a', ['A♠', 'K♠'], W], ['b', []]])).a;
    expect(royal).toEqual({ royalFlush: 1 });
  });

  it('quads lying on the board belong to nobody', () => {
    const got = handEventsOfHand(hand(['9♠', '9♥', '9♦', '9♣', 'K♦'], [['a', ['A♠', '2♣'], W], ['b', ['3♠', '4♣']]]));
    expect(got).toEqual({});
  });

  it('from the recorded handType when the cards are not there', () => {
    const got = handEventsOfHand(hand([], [
      ['a', [], { ...W, handType: 'royal_flush' }],
      ['b', [], { handType: 'straight_flush' }],
      ['c', [], { handType: 'four_of_a_kind' }],
    ]));
    expect(got.a).toEqual({ royalFlush: 1 });
    expect(got.b).toEqual({ straightFlush: 1, tragicHero: 1 });
    expect(got.c).toEqual({ quads: 1, tragicHero: 1 });
  });

  it('cards seen twice are not trusted: hand types only', () => {
    const got = handEventsOfHand(hand(['9♦', '9♣', '2♠', '5♥', 'K♦'], [
      ['a', ['9♦', '9♥'], { ...W, handType: 'three_of_a_kind' }],
      ['b', ['A♠', 'A♥']],
    ]));
    expect(got).toEqual({});
  });
});

describe('tragicHero', () => {
  it('four of a kind or better in a hand someone else took', () => {
    // 99 makes quads on the flop; 7♥8♥ fills the straight flush
    const got = handEventsOfHand(hand(['9♠', '9♥', '5♥', '6♥', 'K♦'], [
      ['hero', ['9♦', '9♣']],
      ['sf', ['7♥', '8♥'], W],
    ]));
    expect(got.hero).toEqual({ quads: 1, tragicHero: 1 });
    expect(got.sf).toMatchObject({ straightFlush: 1 });
  });

  it('older records: the winner from chips; no winner known → no tragicHero', () => {
    const players = [['a', [], { handType: 'four_of_a_kind', chips: -500 }], ['b', [], { handType: 'straight_flush', chips: 500 }]];
    expect(handEventsOfHand(hand([], players)).a).toEqual({ quads: 1, tragicHero: 1 });
    const unknown = players.map(([id, cards, extra]) => [id, cards, { ...extra, chips: 0 }]);
    expect(handEventsOfHand(hand([], unknown)).a).toEqual({ quads: 1 });
  });
});

describe('equity', () => {
  it('turn and flop are exact; preflop is sampled and repeatable', () => {
    // KK against AA, no king until the river: 2 outs of 44 on the turn
    const e = streetEquities(['Ks', 'Kh'], ['As', 'Ah'], ['2c', '7d', '9h', 'Js', 'Kd']);
    expect(e.turn).toMatchObject({ win: 2, tie: 0, n: 44 });
    expect(e.flop.n).toBe(990);
    expect(e.preflop.n).toBe(20000);
    expect(e.preflop.equity).toBeGreaterThan(0.15);
    expect(e.preflop.equity).toBeLessThan(0.2);
    expect(streetEquities(['Ks', 'Kh'], ['As', 'Ah'], ['2c', '7d', '9h', 'Js', 'Kd'])).toEqual(e);
  });

  it('other known hole cards are dead', () => {
    const e = streetEquities(['Ks', 'Kh'], ['As', 'Ah'], ['2c', '7d', '9h', 'Js', 'Kd'], ['Kc', '3s'], { streets: ['turn'] });
    expect(e.turn).toMatchObject({ win: 1, n: 42 });
    expect(e.preflop).toBeNull();
  });
});

describe('classifyShowdown', () => {
  const eq = (win, tie, n) => ({ win, tie, n, equity: (win + tie / 2) / n });
  const ahead = eq(30, 0, 40);

  it('bad beat: ≤ 20% at any street, exactly 20% included', () => {
    const at = (street, e) => classifyShowdown({ equities: { preflop: ahead, flop: ahead, turn: ahead, [street]: e } });
    expect(at('turn', eq(8, 0, 40)).badBeat).toBe(true); // 20%
    expect(at('turn', eq(7, 2, 40)).badBeat).toBe(true); // 7 + 2 halves = 20%
    expect(at('turn', eq(9, 0, 40)).badBeat).toBe(false); // 22.5%
    expect(at('flop', eq(198, 0, 990)).badBeat).toBe(true);
    expect(at('flop', eq(199, 0, 990)).badBeat).toBe(false);
    expect(at('preflop', eq(3999, 2, 20000)).badBeat).toBe(true);
    expect(at('preflop', eq(4001, 0, 20000)).badBeat).toBe(false);
  });

  it('cooler: both big and ≥ 50% at all three streets (exactly 50% included)', () => {
    const half = eq(20, 0, 40);
    const all = { preflop: half, flop: ahead, turn: ahead };
    expect(classifyShowdown({ equities: all, winnerBig: true, loserBig: true }))
      .toEqual({ badBeat: false, cooler: true });
    expect(classifyShowdown({ equities: all, winnerBig: true, loserBig: false }).cooler).toBe(false);
    const behind = { ...all, flop: eq(19, 1, 40) };
    expect(classifyShowdown({ equities: behind, winnerBig: true, loserBig: true }).cooler).toBe(false);
    expect(classifyShowdown({ equities: { flop: ahead, turn: ahead }, winnerBig: true, loserBig: true }).cooler)
      .toBe(false);
  });
});

describe('bad beats and coolers in hand records', () => {
  it('AA over KK on a blank board: a cooler for both', () => {
    const got = handEventsOfHand(hand(['2♣', '7♦', '9♥', 'J♠', '3♦'], [['aa', ['A♠', 'A♥'], W], ['kk', ['K♠', 'K♥']]]));
    expect(got).toEqual({ aa: { coolers: 1 }, kk: { coolers: 1 } });
  });

  it('KK cracking AA with a king on the river: a bad beat, not a cooler', () => {
    const got = handEventsOfHand(hand(['2♣', '7♦', '9♥', 'J♠', 'K♦'], [['kk', ['K♠', 'K♥'], W], ['aa', ['A♠', 'A♥']]]));
    expect(got).toEqual({ kk: { badBeatWins: 1 } });
  });

  it('set over set, ahead from the flop: a cooler for both', () => {
    const got = handEventsOfHand(hand(['9♦', '5♣', '2♠', 'J♥', '3♦'], [['nines', ['9♠', '9♥'], W], ['fives', ['5♠', '5♥']]]));
    expect(got).toEqual({ nines: { coolers: 1 }, fives: { coolers: 1 } });
  });

  it('set under set that hits quads on the river: a bad beat, not a cooler', () => {
    const got = handEventsOfHand(hand(['9♦', '5♣', '2♠', 'J♥', '5♦'], [['fives', ['5♠', '5♥'], W], ['nines', ['9♠', '9♥']]]));
    expect(got).toEqual({ fives: { quads: 1, badBeatWins: 1 } });
  });

  it('no cooler without two big hands; trips on the board are nobody\'s', () => {
    // AQ over KJ, never behind, but neither is premium nor beats the board's trips
    const got = handEventsOfHand(hand(['4♦', '4♣', '4♠', '7♥', '2♦'], [['aq', ['A♠', 'Q♥'], W], ['kj', ['K♠', 'J♥']]]));
    expect(got).toEqual({});
    // A full house does beat the board's trips: JJ over 88 is a cooler
    const boat = handEventsOfHand(hand(['4♦', '4♣', '4♠', 'K♥', '2♦'], [['jj', ['J♠', 'J♥'], W], ['ee', ['8♠', '8♥']]]));
    expect(boat).toEqual({ jj: { coolers: 1 }, ee: { coolers: 1 } });
  });

  it('counts a winner once per hand however many it beat from behind', () => {
    const got = handEventsOfHand(hand(['2♣', '7♦', '9♥', 'J♠', 'K♦'], [
      ['kk', ['K♠', 'K♥'], W], ['aa', ['A♠', 'A♥']], ['aa2', ['A♦', 'A♣']],
    ]));
    expect(got.kk).toEqual({ badBeatWins: 1 });
  });

  it('missing cards or a short board: skipped', () => {
    const mucked = handEventsOfHand(hand(['2♣', '7♦', '9♥', 'J♠', 'K♦'], [['kk', ['K♠', 'K♥'], W], ['aa', []]]));
    expect(mucked).toEqual({});
    const turnOnly = handEventsOfHand(hand(['2♣', '7♦', '9♥', 'J♠'], [['aa', ['A♠', 'A♥'], W], ['kk', ['K♠', 'K♥']]]));
    expect(turnOnly).toEqual({});
  });
});

describe('gameHandEvents', () => {
  const players = [
    { id: 'p1', uid: 'u1', name: 'A' },
    { id: 'p2', uid: 'u2', name: 'B' },
    { id: 'g', name: 'Guest' },
  ];

  it('per uid, summed over the hands; guests are left out; everyone gets every key', () => {
    const hands = [
      hand([], [['p1', [], { ...W, handType: 'four_of_a_kind' }], ['g', [], { handType: 'royal_flush' }]]),
      hand([], [['p1', [], { ...W, handType: 'four_of_a_kind' }], ['p2', [], { handType: 'four_of_a_kind' }]]),
    ];
    const got = gameHandEvents({ players, hands, transactions: [] });
    expect(Object.keys(got).sort()).toEqual(['u1', 'u2']);
    expect(got.u1).toMatchObject({ quads: 2, tragicHero: 0, royalFlush: 0 });
    expect(got.u2).toMatchObject({ quads: 1, tragicHero: 1 });
    for (const key of HAND_EVENT_KEYS) expect(typeof got.u2[key]).toBe('number');
  });

  it('hands marked excludeFromTitles (test data) are skipped', () => {
    const quads = hand([], [['p1', [], { ...W, handType: 'four_of_a_kind' }], ['p2', []]]);
    const hands = [quads, { ...quads, excludeFromTitles: true }];
    expect(gameHandEvents({ players, hands }).u1).toMatchObject({ quads: 1 });
    expect(gameHandEvents({ players, hands: [{ ...quads, excludeFromTitles: true }] }).u1).toMatchObject({ quads: 0 });
  });

  it('a seat no longer on the roster falls back to the hand\'s playerUid', () => {
    const hands = [hand([], [['gone', [], { ...W, handType: 'four_of_a_kind', playerUid: 'u9' }], ['p1', []]])];
    expect(gameHandEvents({ players, hands }).u9).toMatchObject({ quads: 1 });
  });

  it('adds revenge from the knockout log', () => {
    const ko = (seq, targetId, by) => ({
      type: 'eliminate', status: 'active', targetId, restore: { seq, bounty: { awards: by.map((playerId) => ({ playerId })) } },
    });
    const got = gameHandEvents({ players, hands: [], transactions: [ko(1, 'p2', ['p1']), ko(2, 'p1', ['p2'])] });
    expect(got.u2.revenge).toBe(1);
    expect(got.u1.revenge).toBe(0);
  });
});
