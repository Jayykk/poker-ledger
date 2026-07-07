/**
 * Firestore security-rules tests.
 *
 * Run via `npm run test:rules` — requires the Firestore emulator
 * (`firebase emulators:exec` wraps this suite; see package.json).
 *
 * These tests pin down the access model:
 *  - `get` by document ID stays open (link-based joining / shared URLs)
 *  - `list` is restricted so strangers cannot enumerate the database
 *  - Cloud-Functions-only collections reject client writes
 */
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  collection, collectionGroup, query, where,
} from 'firebase/firestore';

let testEnv;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CHARLIE = 'charlie-uid';
const ADMIN = 'admin-uid';

const aliceDb = () => testEnv.authenticatedContext(ALICE).firestore();
const bobDb = () => testEnv.authenticatedContext(BOB).firestore();
const charlieDb = () => testEnv.authenticatedContext(CHARLIE).firestore();
const adminDb = () => testEnv.authenticatedContext(ADMIN).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'poker-ledger-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed data with rules disabled (simulates Cloud Functions / existing data).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', ADMIN), { role: 'admin' });

    await setDoc(doc(db, 'games', 'active-game'), {
      status: 'active', hostUid: ALICE, players: [], name: 'Active',
    });
    await setDoc(doc(db, 'games', 'settled-game'), {
      status: 'completed', hostUid: ALICE, players: [], name: 'Settled',
    });
    await setDoc(doc(db, 'games', 'active-game', 'hands', 'hand-1'), {
      players: [], createdAt: new Date(),
    });

    await setDoc(doc(db, 'pokerGames', 'waiting-room'), {
      status: 'waiting', meta: { createdBy: ALICE, blinds: { small: 10, big: 20 } },
    });
    await setDoc(doc(db, 'pokerGames', 'finished-room'), {
      status: 'finished', meta: { createdBy: ALICE, blinds: { small: 10, big: 20 } },
    });
    await setDoc(doc(db, 'pokerGames', 'waiting-room', 'private', ALICE), {
      holeCards: ['Ah', 'Kd'],
    });
    await setDoc(doc(db, 'pokerGames', 'waiting-room', 'hands', 'hand-1'), {
      handNumber: 1,
    });

    await setDoc(doc(db, 'transactions', 'tx-1'), {
      gameId: 'active-game', status: 'active', amount: 100,
      targetUid: BOB, actionUid: ALICE,
    });
    // Recorded by Bob in Alice's game — exercises the host-undo branch.
    await setDoc(doc(db, 'transactions', 'tx-by-bob'), {
      gameId: 'active-game', status: 'active', amount: 200,
      targetUid: BOB, actionUid: BOB,
    });

    await setDoc(doc(db, 'tournamentSessions', 'dealer-on'), {
      hostUid: ALICE, dealerModeEnabled: true, status: 'running',
    });
    await setDoc(doc(db, 'tournamentSessions', 'dealer-off'), {
      hostUid: ALICE, dealerModeEnabled: false, status: 'running',
    });

    await setDoc(doc(db, 'timeBankSessions', 'tb-1'), {
      hostUid: ALICE, seconds: 60,
    });

    await setDoc(doc(db, 'users', ALICE), { name: 'Alice' });
    await setDoc(doc(db, 'users', BOB), { name: 'Bob' });

    // Live event (Session v2 — periods): Alice hosts, scheduling.
    await setDoc(doc(db, 'sessions', 'evt-1'), {
      hostUid: ALICE,
      hostName: 'Alice',
      status: 'scheduling',
      periods: [
        { id: 'pA', order: 0, label: '下午', type: 'cash', maxPlayers: 8, status: 'queued', roster: [], rosterUids: [] },
      ],
      participantUids: [],
      currentSlotIndex: -1,
      activeSlot: null,
    });
    // An event Bob has RSVP'd to a period of (Alice hosts).
    await setDoc(doc(db, 'sessions', 'evt-joined'), {
      hostUid: ALICE, hostName: 'Alice', status: 'scheduling',
      periods: [
        { id: 'pB', order: 0, label: '晚上', type: 'tournament', maxPlayers: 9, status: 'queued',
          roster: [{ uid: BOB, name: 'Bob' }], rosterUids: [BOB] },
      ],
      participantUids: [BOB],
      currentSlotIndex: -1, activeSlot: null,
    });
  });
});

describe('games (ledger)', () => {
  it('any signed-in user can GET a game by ID (link-based join)', async () => {
    await assertSucceeds(getDoc(doc(bobDb(), 'games', 'settled-game')));
  });

  it('unauthenticated users cannot read games', async () => {
    await assertFails(getDoc(doc(anonDb(), 'games', 'active-game')));
  });

  it('lobby can LIST active games', async () => {
    await assertSucceeds(getDocs(
      query(collection(bobDb(), 'games'), where('status', '==', 'active'))
    ));
  });

  it('hosts can LIST their own games regardless of status', async () => {
    await assertSucceeds(getDocs(
      query(collection(aliceDb(), 'games'), where('hostUid', '==', ALICE))
    ));
  });

  it('non-admins cannot enumerate all games (unfiltered list)', async () => {
    await assertFails(getDocs(collection(bobDb(), 'games')));
  });

  it('non-admins cannot LIST settled games they do not host', async () => {
    await assertFails(getDocs(
      query(collection(bobDb(), 'games'), where('status', '==', 'completed'))
    ));
  });

  it('admins can enumerate all games', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'games')));
  });

  it('create requires hostUid to match the caller', async () => {
    await assertFails(setDoc(doc(bobDb(), 'games', 'spoofed-game'), {
      status: 'active', hostUid: ALICE, players: [], name: 'Spoofed',
    }));
    await assertSucceeds(setDoc(doc(bobDb(), 'games', 'bobs-game'), {
      status: 'active', hostUid: BOB, players: [], name: 'Bob\'s',
    }));
  });

  it('non-hosts may update the roster (capability model: link = invite)', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'games', 'active-game'), {
      players: [{ uid: BOB, name: 'Bob', buyIn: 1000 }],
    }));
  });

  it('non-hosts cannot touch settlement, lifecycle, or ownership fields', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'games', 'active-game'), {
      status: 'completed', settlementSnapshot: [{ odId: BOB, profit: 99999 }],
    }));
    await assertFails(updateDoc(doc(bobDb(), 'games', 'active-game'), {
      hostUid: BOB,
    }));
    await assertFails(updateDoc(doc(bobDb(), 'games', 'active-game'), {
      players: [], rate: 100,
    }));
  });

  it('the host can settle (status/rate/settlementSnapshot)', async () => {
    await assertSucceeds(updateDoc(doc(aliceDb(), 'games', 'active-game'), {
      status: 'completed', rate: 10, settlementSnapshot: [],
    }));
  });

  it('only the host or an admin can delete a game', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(bobDb(), 'games', 'active-game')));
    await assertSucceeds(deleteDoc(doc(aliceDb(), 'games', 'active-game')));
  });

  it('players can create and read manual hand records', async () => {
    await assertSucceeds(addDoc(
      collection(bobDb(), 'games', 'active-game', 'hands'),
      { players: [], createdAt: new Date() }
    ));
    await assertSucceeds(getDocs(collection(bobDb(), 'games', 'active-game', 'hands')));
  });
});

describe('pokerGames (Texas Hold\'em rooms)', () => {
  it('any signed-in user can GET a room by ID', async () => {
    await assertSucceeds(getDoc(doc(bobDb(), 'pokerGames', 'finished-room')));
  });

  it('lobby can LIST joinable rooms (status in waiting/playing)', async () => {
    await assertSucceeds(getDocs(
      query(collection(bobDb(), 'pokerGames'), where('status', 'in', ['waiting', 'playing']))
    ));
  });

  it('non-admins cannot enumerate all rooms', async () => {
    await assertFails(getDocs(collection(bobDb(), 'pokerGames')));
  });

  it('creators can LIST their own rooms', async () => {
    await assertSucceeds(getDocs(
      query(collection(aliceDb(), 'pokerGames'), where('meta.createdBy', '==', ALICE))
    ));
  });

  it('players can update non-meta state (settling flag)', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'pokerGames', 'waiting-room'), {
      settling: true,
    }));
  });

  it('non-creators cannot tamper with meta config', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'pokerGames', 'waiting-room'), {
      'meta.blinds': { small: 1000, big: 2000 },
    }));
  });

  it('the creator can update meta config', async () => {
    await assertSucceeds(updateDoc(doc(aliceDb(), 'pokerGames', 'waiting-room'), {
      'meta.blinds': { small: 25, big: 50 },
    }));
  });

  it('hole cards are readable only by their owner', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'pokerGames', 'waiting-room', 'private', ALICE)));
    await assertFails(getDoc(doc(bobDb(), 'pokerGames', 'waiting-room', 'private', ALICE)));
  });

  it('clients can never write hole cards or hand history', async () => {
    await assertFails(setDoc(
      doc(aliceDb(), 'pokerGames', 'waiting-room', 'private', ALICE),
      { holeCards: ['As', 'Ad'] }
    ));
    await assertFails(setDoc(
      doc(aliceDb(), 'pokerGames', 'waiting-room', 'hands', 'hand-2'),
      { handNumber: 2 }
    ));
  });
});

describe('hands collection-group (leaderboard special hands)', () => {
  it('signed-in users can run a collectionGroup query over hands', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(bobDb(), 'hands'))));
  });

  it('unauthenticated users cannot', async () => {
    await assertFails(getDocs(query(collectionGroup(anonDb(), 'hands'))));
  });
});

describe('transactions (buy-in audit)', () => {
  it('participants can query a game\'s transaction log by gameId', async () => {
    await assertSucceeds(getDocs(
      query(collection(bobDb(), 'transactions'), where('gameId', '==', 'active-game'))
    ));
  });

  it('create must be signed as the caller with a sane shape', async () => {
    await assertSucceeds(addDoc(collection(bobDb(), 'transactions'), {
      gameId: 'active-game', actionUid: BOB, actionName: 'Bob',
      targetUid: BOB, targetName: 'Bob', amount: 1000, type: 'buy_in',
      status: 'active', undoneBy: null, undoOf: null,
    }));
    // Spoofing someone else as the actor is rejected.
    await assertFails(addDoc(collection(bobDb(), 'transactions'), {
      gameId: 'active-game', actionUid: ALICE, actionName: 'Alice',
      targetUid: BOB, targetName: 'Bob', amount: 1000, type: 'buy_in',
      status: 'active',
    }));
    // Non-numeric amounts and non-active initial status are rejected.
    await assertFails(addDoc(collection(bobDb(), 'transactions'), {
      gameId: 'active-game', actionUid: BOB, actionName: 'Bob',
      targetUid: BOB, targetName: 'Bob', amount: '1000', type: 'buy_in',
      status: 'active',
    }));
    await assertFails(addDoc(collection(bobDb(), 'transactions'), {
      gameId: 'active-game', actionUid: BOB, actionName: 'Bob',
      targetUid: BOB, targetName: 'Bob', amount: 1000, type: 'buy_in',
      status: 'undone',
    }));
  });

  it('undo: allowed for the original actor', async () => {
    await assertSucceeds(updateDoc(doc(aliceDb(), 'transactions', 'tx-1'), {
      status: 'undone',
    }));
  });

  it('undo: allowed for the game host', async () => {
    // tx-by-bob was recorded by Bob in Alice's game — Alice hosts, so she may undo it.
    await assertSucceeds(updateDoc(doc(aliceDb(), 'transactions', 'tx-by-bob'), {
      status: 'undone',
    }));
  });

  it('undo: strangers (neither actor, host, nor admin) are rejected', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'transactions', 'tx-1'), {
      status: 'undone',
    }));
  });

  it('undo cannot change other fields, be reverted, or transition elsewhere', async () => {
    await assertFails(updateDoc(doc(aliceDb(), 'transactions', 'tx-1'), {
      status: 'undone', amount: 999999,
    }));
    await assertFails(updateDoc(doc(aliceDb(), 'transactions', 'tx-1'), {
      status: 'active', amount: 999999,
    }));
  });
});

describe('tournamentSessions', () => {
  it('shared-URL viewers can GET a session by ID', async () => {
    await assertSucceeds(getDoc(doc(bobDb(), 'tournamentSessions', 'dealer-off')));
  });

  it('non-hosts cannot enumerate sessions', async () => {
    await assertFails(getDocs(collection(bobDb(), 'tournamentSessions')));
  });

  it('hosts can LIST their own sessions', async () => {
    await assertSucceeds(getDocs(
      query(collection(aliceDb(), 'tournamentSessions'), where('hostUid', '==', ALICE))
    ));
  });

  it('strangers can update a session only when dealer mode is enabled', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'tournamentSessions', 'dealer-on'), {
      status: 'paused',
    }));
    await assertFails(updateDoc(doc(bobDb(), 'tournamentSessions', 'dealer-off'), {
      status: 'paused',
    }));
  });
});

describe('sessions (live event layer)', () => {
  it('any signed-in user can GET an event by ID (shared LIFF link)', async () => {
    await assertSucceeds(getDoc(doc(bobDb(), 'sessions', 'evt-1')));
  });

  it('non-hosts cannot enumerate events', async () => {
    await assertFails(getDocs(collection(bobDb(), 'sessions')));
  });

  it('hosts can LIST their own events', async () => {
    await assertSucceeds(getDocs(
      query(collection(aliceDb(), 'sessions'), where('hostUid', '==', ALICE))
    ));
  });

  it('registered players can LIST events they joined (participantUids array-contains)', async () => {
    await assertSucceeds(getDocs(
      query(collection(bobDb(), 'sessions'), where('participantUids', 'array-contains', BOB))
    ));
  });

  it('a player cannot list events they have NOT joined', async () => {
    await assertFails(getDocs(
      query(collection(bobDb(), 'sessions'), where('participantUids', 'array-contains', 'someone-else'))
    ));
  });

  it('create requires hostUid to match the caller', async () => {
    await assertFails(setDoc(doc(bobDb(), 'sessions', 'evt-bad'), {
      hostUid: ALICE, status: 'scheduling', maxPlayers: 8,
    }));
    await assertSucceeds(setDoc(doc(bobDb(), 'sessions', 'evt-bob'), {
      hostUid: BOB, status: 'scheduling', maxPlayers: 8,
      roster: [], rosterUids: [], tableQueue: [],
    }));
  });

  it('a non-host may update ONLY periods + participantUids (RSVP join)', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      periods: [
        { id: 'pA', order: 0, label: '下午', type: 'cash', maxPlayers: 8, status: 'queued',
          roster: [{ uid: BOB, name: 'Bob' }], rosterUids: [BOB] },
      ],
      participantUids: [BOB],
      updatedAt: new Date(),
    }));
  });

  it('a non-host cannot change status or name', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      status: 'active',
    }));
    await assertFails(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      name: 'Hijacked', periods: [], participantUids: [],
    }));
  });

  it('a non-host cannot add or remove periods', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      periods: [], participantUids: [], updatedAt: new Date(),
    }));
    await assertFails(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      periods: [
        { id: 'pA', order: 0, label: '下午', type: 'cash', maxPlayers: 8, status: 'queued',
          roster: [{ uid: BOB, name: 'Bob' }], rosterUids: [BOB] },
        { id: 'pX', order: 1, label: '加開', type: 'cash', maxPlayers: 8, status: 'queued',
          roster: [], rosterUids: [] },
      ],
      participantUids: [BOB],
      updatedAt: new Date(),
    }));
  });

  it('a non-host can only add/remove THEMSELVES from participantUids', async () => {
    // Bob smuggling a third uid in alongside himself is rejected.
    await assertFails(updateDoc(doc(bobDb(), 'sessions', 'evt-1'), {
      periods: [
        { id: 'pA', order: 0, label: '下午', type: 'cash', maxPlayers: 8, status: 'queued',
          roster: [{ uid: BOB, name: 'Bob' }, { uid: CHARLIE, name: 'Charlie' }],
          rosterUids: [BOB, CHARLIE] },
      ],
      participantUids: [BOB, CHARLIE],
      updatedAt: new Date(),
    }));
    // Charlie kicking Bob off an event he RSVP'd to is rejected.
    await assertFails(updateDoc(doc(charlieDb(), 'sessions', 'evt-joined'), {
      periods: [
        { id: 'pB', order: 0, label: '晚上', type: 'tournament', maxPlayers: 9, status: 'queued',
          roster: [], rosterUids: [] },
      ],
      participantUids: [],
      updatedAt: new Date(),
    }));
    // Bob cancelling his own RSVP is fine.
    await assertSucceeds(updateDoc(doc(bobDb(), 'sessions', 'evt-joined'), {
      periods: [
        { id: 'pB', order: 0, label: '晚上', type: 'tournament', maxPlayers: 9, status: 'queued',
          roster: [], rosterUids: [] },
      ],
      participantUids: [],
      updatedAt: new Date(),
    }));
  });

  it('the host can change anything (activate a period)', async () => {
    await assertSucceeds(updateDoc(doc(aliceDb(), 'sessions', 'evt-1'), {
      status: 'active',
      currentSlotIndex: 0,
      activeSlot: { id: 'pA', type: 'cash', gameId: 'g1' },
    }));
  });

  it('only the host or an admin can delete an event', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertFails(deleteDoc(doc(bobDb(), 'sessions', 'evt-1')));
    await assertSucceeds(deleteDoc(doc(aliceDb(), 'sessions', 'evt-1')));
  });
});

describe('timeBankSessions', () => {
  it('shared-URL viewers can GET; only the host can update', async () => {
    await assertSucceeds(getDoc(doc(bobDb(), 'timeBankSessions', 'tb-1')));
    await assertFails(updateDoc(doc(bobDb(), 'timeBankSessions', 'tb-1'), { seconds: 1 }));
    await assertSucceeds(updateDoc(doc(aliceDb(), 'timeBankSessions', 'tb-1'), { seconds: 30 }));
  });
});

describe('users / friends / invitations', () => {
  it('signed-in users can list user profiles (leaderboard, friend search)', async () => {
    await assertSucceeds(getDocs(collection(bobDb(), 'users')));
  });

  it('only the owner writes their profile', async () => {
    await assertFails(setDoc(doc(bobDb(), 'users', ALICE), { name: 'Hacked' }));
    await assertSucceeds(setDoc(doc(aliceDb(), 'users', ALICE), { name: 'Alice 2' }));
  });

  it('history_sub is authenticated-read (leaderboard), CF-write only', async () => {
    await assertSucceeds(getDocs(collection(bobDb(), 'users', ALICE, 'history_sub')));
    await assertFails(getDocs(collection(anonDb(), 'users', ALICE, 'history_sub')));
    await assertFails(setDoc(
      doc(aliceDb(), 'users', ALICE, 'history_sub', 'g1'), { profit: 1 }
    ));
  });

  it('accepting a friend request can mirror an entry referencing yourself', async () => {
    // Bob accepts Alice's request → Bob writes himself into Alice's friends list
    await assertSucceeds(addDoc(collection(bobDb(), 'users', ALICE, 'friends'), {
      uid: BOB, name: 'Bob',
    }));
    // …but cannot plant arbitrary entries in someone else's list
    await assertFails(addDoc(collection(bobDb(), 'users', ALICE, 'friends'), {
      uid: 'someone-else', name: 'Mallory',
    }));
  });

  it('invitations: anyone can create into a mailbox; only the owner reads it', async () => {
    await assertSucceeds(addDoc(collection(aliceDb(), 'users', BOB, 'invitations'), {
      gameId: 'active-game', fromUid: ALICE, status: 'pending',
    }));
    await assertFails(getDocs(
      query(collection(aliceDb(), 'users', BOB, 'invitations'), where('status', '==', 'pending'))
    ));
    await assertSucceeds(getDocs(
      query(collection(bobDb(), 'users', BOB, 'invitations'), where('status', '==', 'pending'))
    ));
  });

  it('friendRequests: sender identity must match auth', async () => {
    await assertSucceeds(addDoc(collection(bobDb(), 'friendRequests'), {
      fromUid: BOB, toUid: ALICE, status: 'pending',
    }));
    await assertFails(addDoc(collection(bobDb(), 'friendRequests'), {
      fromUid: ALICE, toUid: BOB, status: 'pending',
    }));
  });

  it('admins collection is server-managed; users may check only their own status', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'admins', ADMIN)));
    await assertFails(getDoc(doc(bobDb(), 'admins', ADMIN)));
    await assertFails(setDoc(doc(bobDb(), 'admins', BOB), { role: 'admin' }));
  });
});
