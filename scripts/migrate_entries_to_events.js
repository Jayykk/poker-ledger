#!/usr/bin/env node

/**
 * Migration Script: Migrate Array-based Events to Subcollection Documents
 * 
 * This script migrates existing game data from the old array-based structure
 * to the new subcollection-based structure. It handles:
 * - actions arrays in hand documents -> events subcollection with type 'action'
 * - shownCards arrays in hand documents -> events subcollection with type 'shownCards'
 * - spectators arrays in game documents -> events subcollection with type 'spectatorJoin'
 * 
 * Usage:
 *   node scripts/migrate_entries_to_events.js [options]
 * 
 * Options:
 *   --delete-old    Delete original array fields after migration (default: false)
 *   --dry-run       Show what would be migrated without making changes (default: false)
 *   --game-id       Migrate only a specific game ID (optional)
 * 
 * Examples:
 *   # Dry run to see what would be migrated
 *   node scripts/migrate_entries_to_events.js --dry-run
 * 
 *   # Migrate all games, keeping original arrays
 *   node scripts/migrate_entries_to_events.js
 * 
 *   # Migrate all games and delete original arrays
 *   node scripts/migrate_entries_to_events.js --delete-old
 * 
 *   # Migrate specific game only
 *   node scripts/migrate_entries_to_events.js --game-id abc123
 * 
 * Prerequisites:
 *   - Firebase Admin SDK initialized with service account credentials
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable or use default credentials
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  deleteOld: args.includes('--delete-old'),
  dryRun: args.includes('--dry-run'),
  gameId: null,
};

const gameIdIndex = args.indexOf('--game-id');
if (gameIdIndex !== -1 && args[gameIdIndex + 1]) {
  options.gameId = args[gameIdIndex + 1];
}

console.log('Migration Options:', options);
console.log('');

// Initialize Firebase Admin
try {
  // Try to load service account from common locations
  const serviceAccountPaths = [
    join(__dirname, '..', 'serviceAccountKey.json'),
    join(__dirname, '..', 'service-account.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  let serviceAccount = null;
  for (const path of serviceAccountPaths) {
    if (path && existsSync(path)) {
      const { default: sa } = await import(path, { assert: { type: 'json' } });
      serviceAccount = sa;
      console.log(`Using service account from: ${path}`);
      break;
    }
  }

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    console.log('Using default application credentials');
    initializeApp();
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  console.log('Please ensure GOOGLE_APPLICATION_CREDENTIALS is set or service account file exists');
  process.exit(1);
}

const db = getFirestore();

/**
 * Convert various timestamp formats to Firestore Timestamp
 */
function normalizeTimestamp(value) {
  if (!value) {
    return Timestamp.now();
  }
  
  if (value instanceof Timestamp) {
    return value;
  }
  
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  
  if (typeof value === 'string') {
    try {
      return Timestamp.fromDate(new Date(value));
    } catch (e) {
      return Timestamp.now();
    }
  }
  
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  
  if (value._seconds !== undefined && value._nanoseconds !== undefined) {
    return new Timestamp(value._seconds, value._nanoseconds);
  }
  
  return Timestamp.now();
}

/**
 * Migrate hand actions from arrays to events subcollection
 */
async function migrateHandActions(gameId, handDoc, batch, stats) {
  const handData = handDoc.data();
  const actions = handData.actions || [];
  
  if (actions.length === 0) {
    return;
  }
  
  console.log(`  Migrating ${actions.length} actions from hand ${handDoc.id}`);
  
  const gameRef = db.collection('pokerGames').doc(gameId);
  const eventsRef = gameRef.collection('events');
  
  for (const action of actions) {
    const eventData = {
      type: 'action',
      handNumber: handData.handNumber,
      odId: action.odId,
      action: action.action,
      amount: action.amount || 0,
      round: action.round,
      timestamp: normalizeTimestamp(action.timestamp),
    };
    
    if (!options.dryRun) {
      const newEventRef = eventsRef.doc();
      batch.set(newEventRef, eventData);
    }
    
    stats.actionsMigrated++;
  }
  
  // Delete the old array field if requested
  if (options.deleteOld && !options.dryRun) {
    batch.update(handDoc.ref, { actions: FieldValue.delete() });
  }
}

/**
 * Migrate shown cards from arrays to events subcollection
 */
async function migrateShownCards(gameId, handDoc, batch, stats) {
  const handData = handDoc.data();
  const shownCards = handData.shownCards || [];
  
  if (shownCards.length === 0) {
    return;
  }
  
  console.log(`  Migrating ${shownCards.length} shown cards from hand ${handDoc.id}`);
  
  const gameRef = db.collection('pokerGames').doc(gameId);
  const eventsRef = gameRef.collection('events');
  
  for (const shown of shownCards) {
    const eventData = {
      type: 'shownCards',
      handNumber: handData.handNumber,
      odId: shown.odId,
      cards: shown.cards,
      timestamp: normalizeTimestamp(shown.timestamp),
    };
    
    if (!options.dryRun) {
      const newEventRef = eventsRef.doc();
      batch.set(newEventRef, eventData);
    }
    
    stats.shownCardsMigrated++;
  }
  
  // Delete the old array field if requested
  if (options.deleteOld && !options.dryRun) {
    batch.update(handDoc.ref, { shownCards: FieldValue.delete() });
  }
}

/**
 * Migrate spectators from arrays to events subcollection
 */
async function migrateSpectators(gameDoc, batch, stats) {
  const gameData = gameDoc.data();
  const spectators = gameData.spectators || [];
  
  if (spectators.length === 0) {
    return;
  }
  
  console.log(`  Migrating ${spectators.length} spectators from game ${gameDoc.id}`);
  
  const eventsRef = gameDoc.ref.collection('events');
  
  for (const spectator of spectators) {
    const eventData = {
      type: 'spectatorJoin',
      userId: spectator.userId,
      userName: spectator.userName,
      userAvatar: spectator.userAvatar || '',
      timestamp: normalizeTimestamp(spectator.joinedAt),
    };
    
    if (!options.dryRun) {
      const newEventRef = eventsRef.doc();
      batch.set(newEventRef, eventData);
    }
    
    stats.spectatorsMigrated++;
  }
  
  // Delete the old array field if requested
  if (options.deleteOld && !options.dryRun) {
    batch.update(gameDoc.ref, { spectators: FieldValue.delete() });
  }
}

/**
 * Migrate a single game
 */
async function migrateGame(gameDoc, stats) {
  const gameId = gameDoc.id;
  console.log(`\nMigrating game: ${gameId}`);
  
  let batch = db.batch();
  let operationCount = 0;
  const MAX_BATCH_SIZE = 500; // Firestore limit is 500 operations per batch
  
  // Migrate spectators from game document
  await migrateSpectators(gameDoc, batch, stats);
  operationCount++;
  
  // Migrate hand actions and shown cards from hands subcollection
  const handsSnapshot = await gameDoc.ref.collection('hands').get();
  
  for (const handDoc of handsSnapshot.docs) {
    // Check if we need to commit the current batch and start a new one
    if (operationCount >= MAX_BATCH_SIZE - 10) { // Leave some room
      console.log('  Committing batch...');
      if (!options.dryRun) {
        await batch.commit();
      }
      batch = db.batch();
      operationCount = 0;
    }
    
    await migrateHandActions(gameId, handDoc, batch, stats);
    await migrateShownCards(gameId, handDoc, batch, stats);
    operationCount += 2;
  }
  
  // Commit the final batch
  if (operationCount > 0) {
    console.log('  Committing final batch...');
    if (!options.dryRun) {
      await batch.commit();
    }
  }
  
  stats.gamesMigrated++;
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('Starting migration...\n');
  
  if (options.dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }
  
  const stats = {
    gamesMigrated: 0,
    actionsMigrated: 0,
    shownCardsMigrated: 0,
    spectatorsMigrated: 0,
  };
  
  try {
    let gamesQuery = db.collection('pokerGames');
    
    // Filter by specific game ID if provided
    if (options.gameId) {
      const gameDoc = await db.collection('pokerGames').doc(options.gameId).get();
      if (!gameDoc.exists) {
        console.error(`Game ${options.gameId} not found`);
        return;
      }
      await migrateGame(gameDoc, stats);
    } else {
      // Migrate all games
      const gamesSnapshot = await gamesQuery.get();
      console.log(`Found ${gamesSnapshot.size} games to check for migration\n`);
      
      for (const gameDoc of gamesSnapshot.docs) {
        await migrateGame(gameDoc, stats);
      }
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`Games migrated: ${stats.gamesMigrated}`);
    console.log(`Actions migrated: ${stats.actionsMigrated}`);
    console.log(`Shown cards migrated: ${stats.shownCardsMigrated}`);
    console.log(`Spectators migrated: ${stats.spectatorsMigrated}`);
    console.log('==========================\n');
    
    if (options.dryRun) {
      console.log('This was a dry run. Run without --dry-run to apply changes.');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
