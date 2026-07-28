import { expect, it } from 'vitest';
import { buildUserProjectionDocs } from '../../functions/src/handlers/gameHistoryProjection.js';

it('projects tournament base buy-in and immutable rebuy metrics', () => {
  const docs = buildUserProjectionDocs('g1', {
    name: 'Sunday',
    type: 'tournament',
    status: 'completed',
    baseBuyIn: 1000,
    completedAt: 1000,
    settlementSnapshot: [{
      odId: 'u1',
      name: 'Alice',
      placement: 1,
      buyIn: 3000,
      prize: 4000,
      profit: 1000,
      entryCount: 3,
      rebuyCount: 2,
    }],
  });

  expect(docs[0].data.baseBuyIn).toBe(1000);
  expect(docs[0].data.settlement[0]).toMatchObject({ entryCount: 3, rebuyCount: 2 });
});