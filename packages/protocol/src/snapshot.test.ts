/** Covers viewer-specific snapshot validation so a guest cannot receive another actor's pending context. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createDecisionProtocol } from './decision.ts';
import { createSnapshotProtocol } from './snapshot.ts';

const decisions = createDecisionProtocol({
  choose: {
    context: z.strictObject({ choices: z.array(z.string()) }),
    response: z.strictObject({ picked: z.string() }),
  },
});
const snapshots = createSnapshotProtocol(decisions, z.strictObject({ score: z.number() }));

test('accepts a snapshot containing only its viewer pending decisions', () => {
  const value = snapshots.parse({
    tableId: 't1', viewerId: 'p1', stateVersion: 3,
    view: { score: 5 },
    pending: [{ id: 'd1', tableId: 't1', kind: 'choose', actorId: 'p1', stateVersion: 3, context: { choices: ['a'] } }],
  });
  assert.equal(value.pending.length, 1);
});

test('rejects a snapshot with another actor pending decision', () => {
  assert.throws(() => snapshots.parse({
    tableId: 't1', viewerId: 'p1', stateVersion: 3,
    view: { score: 5 },
    pending: [{ id: 'd2', tableId: 't1', kind: 'choose', actorId: 'p2', stateVersion: 3, context: { choices: ['secret'] } }],
  }));
});

test('rejects hidden fields outside the game view schema', () => {
  assert.throws(() => snapshots.parse({
    tableId: 't1', viewerId: 'p1', stateVersion: 3,
    view: { score: 5, hiddenDeck: ['secret'] }, pending: [],
  }));
});
