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
const ADMIN = 'admin-uid';

const aliceDb = () => testEnv.authenticatedContext(ALICE).firestore();
const bobDb = () => testEnv.authenticatedContext(BOB).firestore();
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

  it('any signed-in user can update a game (capability model: link = invite)', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'games', 'active-game'), {
      players: [{ uid: BOB, name: 'Bob', buyIn: 1000 }],
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

  it('undo: active → undone is allowed', async () => {
    await assertSucceeds(updateDoc(doc(bobDb(), 'transactions', 'tx-1'), {
      status: 'undone',
    }));
  });

  it('undo cannot be reverted or transition to other states', async () => {
    await assertFails(updateDoc(doc(bobDb(), 'transactions', 'tx-1'), {
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

  it('history_sub is owner-read, CF-write only', async () => {
    await assertFails(getDocs(collection(bobDb(), 'users', ALICE, 'history_sub')));
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
