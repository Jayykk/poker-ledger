/**
 * Game Events Library
 * Helper functions for managing game events in subcollections
 *
 * IMPORTANT: This library was created to solve the Firestore limitation where
 * FieldValue.serverTimestamp() cannot be used inside array elements.
 *
 * Previous implementation used FieldValue.arrayUnion() to append events with timestamps
 * to array fields, which caused the error:
 * "FieldValue.serverTimestamp() cannot be used inside of an array"
 *
 * Solution: Store each event as a separate document in a subcollection under
 * games/{gameId}/events, allowing proper use of server timestamps and better
 * queryability/indexing.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Add a game event to the events subcollection
 *
 * @param {string} gameId - Game document ID
 * @param {Object} eventObj - Event data object
 * @param {string} eventObj.type - Event type (e.g., 'action', 'shownCards', 'spectatorJoin')
 * @param {Object|null} transactionOrDb - Optional Firestore transaction or db instance
 * @return {Promise<Object>} Created event with ID
 */
export async function addGameEvent(gameId, eventObj, transactionOrDb = null) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);
  const eventsRef = gameRef.collection('events');

  // Prepare event data with server timestamp if not provided
  const eventData = {
    ...eventObj,
    timestamp: eventObj.timestamp || FieldValue.serverTimestamp(),
  };

  // If a transaction is provided, use it to create the event document
  if (transactionOrDb && typeof transactionOrDb.set === 'function') {
    // It's a transaction
    const newEventRef = eventsRef.doc();
    transactionOrDb.set(newEventRef, eventData);
    return {
      id: newEventRef.id,
      ...eventData,
    };
  } else {
    // No transaction, create directly
    const newEventRef = await eventsRef.add(eventData);
    return {
      id: newEventRef.id,
      ...eventData,
    };
  }
}

/**
 * List game events from the events subcollection
 *
 * @param {string} gameId - Game document ID
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by event type
 * @param {number} options.handNumber - Filter by hand number
 * @param {string} options.orderBy - Field to order by (default: 'timestamp')
 * @param {string} options.order - Order direction: 'asc' or 'desc' (default: 'asc')
 * @param {number} options.limit - Maximum number of events to return
 * @return {Promise<Array>} Array of event objects with IDs
 */
export async function listGameEvents(gameId, options = {}) {
  const db = getFirestore();
  const gameRef = db.collection('pokerGames').doc(gameId);
  const eventsRef = gameRef.collection('events');

  let query = eventsRef;

  // Apply filters
  if (options.type) {
    query = query.where('type', '==', options.type);
  }

  if (options.handNumber !== undefined) {
    query = query.where('handNumber', '==', options.handNumber);
  }

  // Apply ordering
  const orderByField = options.orderBy || 'timestamp';
  const orderDirection = options.order || 'asc';
  query = query.orderBy(orderByField, orderDirection);

  // Apply limit
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Get events as an array (compatibility wrapper for code expecting array format)
 *
 * This function provides backward compatibility for code that expects events
 * in array format from the old data model.
 *
 * @param {string} gameId - Game document ID
 * @param {Object} options - Query options (same as listGameEvents)
 * @return {Promise<Array>} Array of event data (without document IDs)
 */
export async function getEventsAsArray(gameId, options = {}) {
  const events = await listGameEvents(gameId, options);

  // Return events without the document ID, matching old array format
  return events.map(({ id, ...eventData }) => eventData);
}

/**
 * Get actions for a specific hand (compatibility helper)
 *
 * @param {string} gameId - Game document ID
 * @param {number} handNumber - Hand number
 * @return {Promise<Array>} Array of action events
 */
export async function getHandActions(gameId, handNumber) {
  return listGameEvents(gameId, {
    type: 'action',
    handNumber,
    orderBy: 'timestamp',
    order: 'asc',
  });
}

/**
 * Get shown cards for a specific hand (compatibility helper)
 *
 * @param {string} gameId - Game document ID
 * @param {number} handNumber - Hand number
 * @return {Promise<Array>} Array of shown cards events
 */
export async function getHandShownCards(gameId, handNumber) {
  return listGameEvents(gameId, {
    type: 'shownCards',
    handNumber,
    orderBy: 'timestamp',
    order: 'asc',
  });
}

/**
 * Get spectator events (compatibility helper)
 *
 * @param {string} gameId - Game document ID
 * @return {Promise<Array>} Array of spectator join events
 */
export async function getSpectatorEvents(gameId) {
  return listGameEvents(gameId, {
    type: 'spectatorJoin',
    orderBy: 'timestamp',
    order: 'asc',
  });
}
