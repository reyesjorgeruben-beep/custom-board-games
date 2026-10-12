/** Covers actor-scoped snapshots and the validated, versioned decision barrier lifecycle. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { GameEngine } from './index.ts';
import type { GameDefinition } from '@board-games/game-sdk';
import { createDecisionProtocol, createSnapshotProtocol } from '@board-games/protocol';

type Decisions = {
  bid: {
    context: { maximum: number };
    response: { amount: number };
  };
  continue: {
    context: { total: number };
    response: { acknowledge: true };
  };
};

type State = {
  balances: Record<string, number>;
  total: number;
  complete: boolean;
};

type View = {
  total: number;
  ownBalance: number;
};

const decisions = createDecisionProtocol({
  bid: {
    context: z.object({ maximum: z.number().int().nonnegative() }).strict(),
    response: z.object({ amount: z.number().int().nonnegative() }).strict(),
  },
  continue: {
    context: z.object({ total: z.number().int().nonnegative() }).strict(),
    response: z.object({ acknowledge: z.literal(true) }).strict(),
  },
});
const snapshots = createSnapshotProtocol(decisions, z.object({
  total: z.number().int(),
  ownBalance: z.number().int(),
}).strict());

const game: GameDefinition<State, Decisions, {}, View> = {
  metadata: { id: 'test-game', version: '1.0.0', name: 'Test Game', minPlayers: 2, maxPlayers: 2 },
  setup: () => ({ balances: { alice: 10, bob: 20 }, total: 0, complete: false }),
  strategies: {
    bid: {
      createContext: (state, actorId) => ({ maximum: state.balances[actorId]! }),
      validateResponse: (_state, request, response) => response.amount <= request.context.maximum
        ? { valid: true }
        : { valid: false, reason: 'Bid exceeds available balance' },
      apply: (state, resolutions) => ({
        ...state,
        total: state.total + resolutions.reduce((sum, item) => sum + item.submission.response.amount, 0),
      }),
    },
    continue: {
      createContext: (state) => ({ total: state.total }),
      validateResponse: () => ({ valid: true }),
      apply: (state) => ({ ...state, complete: true }),
    },
  },
  turnPolicy: {
    next: (state) => state.total === 0
      ? { kind: 'bid', actorIds: ['alice', 'bob'] }
      : state.complete ? null : { kind: 'continue', actorIds: ['alice'] },
  },
  project: (state, viewerId) => ({ total: state.total, ownBalance: state.balances[viewerId]! }),
};

function createEngine() {
  let decisionSequence = 0;
  return new GameEngine({
    tableId: 'table-1',
    game,
    setup: {},
    players: [{ id: 'alice' }, { id: 'bob' }],
    decisions,
    snapshots,
    createDecisionId: (tableId, sequence) => {
      decisionSequence = sequence;
      return `${tableId}/decision/${decisionSequence}`;
    },
  });
}

function bidSubmission(decisionId: string, actorId: string, amount: unknown, stateVersion = 0) {
  return { decisionId, kind: 'bid', actorId, stateVersion, response: { amount } };
}

test('builds separate pending contexts and snapshots for each decision actor', () => {
  const engine = createEngine();
  const alice = engine.snapshotFor('alice');
  const bob = engine.snapshotFor('bob');

  assert.equal(alice.pending[0]?.id, 'table-1/decision/1');
  assert.equal(bob.pending[0]?.id, 'table-1/decision/2');
  assert.deepEqual(alice.pending.map(({ actorId, context }) => [actorId, context]), [['alice', { maximum: 10 }]]);
  assert.deepEqual(bob.pending.map(({ actorId, context }) => [actorId, context]), [['bob', { maximum: 20 }]]);
  assert.deepEqual(alice.view, { total: 0, ownBalance: 10 });
  assert.deepEqual(bob.view, { total: 0, ownBalance: 20 });
});

test('waits for all actors before applying a barrier and then advances the version', () => {
  const engine = createEngine();
  const aliceRequest = engine.snapshotFor('alice').pending[0]!;
  const bobRequest = engine.snapshotFor('bob').pending[0]!;

  assert.deepEqual(engine.submit(bidSubmission(aliceRequest.id, 'alice', 3)), {
    status: 'waiting', received: 1, required: 2,
  });
  assert.equal(engine.snapshotFor('alice').view.total, 0);

  assert.deepEqual(engine.submit(bidSubmission(bobRequest.id, 'bob', 4)), {
    status: 'resolved', stateVersion: 1,
  });
  assert.equal(engine.snapshotFor('alice').view.total, 7);
  assert.equal(engine.snapshotFor('alice').stateVersion, 1);
  assert.equal(engine.snapshotFor('alice').pending[0]?.kind, 'continue');
});

test('rejects malformed, wrong-actor, duplicate, and illegal submissions without resolving state', () => {
  const engine = createEngine();
  const aliceRequest = engine.snapshotFor('alice').pending[0]!;
  const bobRequest = engine.snapshotFor('bob').pending[0]!;

  assert.throws(() => engine.submit({ ...bidSubmission(aliceRequest.id, 'alice', '3') }));
  assert.throws(() => engine.submit(bidSubmission(aliceRequest.id, 'bob', 3)));
  assert.deepEqual(engine.submit(bidSubmission(aliceRequest.id, 'alice', 3)), {
    status: 'waiting', received: 1, required: 2,
  });
  assert.throws(() => engine.submit(bidSubmission(aliceRequest.id, 'alice', 1)));
  assert.throws(() => engine.submit(bidSubmission(bobRequest.id, 'bob', 21)));
  assert.equal(engine.snapshotFor('alice').view.total, 0);
  assert.equal(engine.snapshotFor('alice').stateVersion, 0);

  engine.submit(bidSubmission(bobRequest.id, 'bob', 5));
  assert.equal(engine.snapshotFor('alice').view.total, 8);
});

test('rejects a stale state version even when the decision id and actor are current', () => {
  const engine = createEngine();
  const aliceRequest = engine.snapshotFor('alice').pending[0]!;
  const bobRequest = engine.snapshotFor('bob').pending[0]!;
  engine.submit(bidSubmission(aliceRequest.id, 'alice', 3));
  engine.submit(bidSubmission(bobRequest.id, 'bob', 4));

  const followup = engine.snapshotFor('alice').pending[0]!;
  assert.throws(() => engine.submit({
    decisionId: followup.id,
    kind: 'continue',
    actorId: 'alice',
    stateVersion: 0,
    response: { acknowledge: true },
  }));
  assert.equal(engine.snapshotFor('alice').view.total, 7);
  assert.equal(engine.snapshotFor('alice').stateVersion, 1);
});

test('clears pending decisions when the turn policy reports a terminal state', () => {
  const engine = createEngine();
  const aliceRequest = engine.snapshotFor('alice').pending[0]!;
  const bobRequest = engine.snapshotFor('bob').pending[0]!;
  engine.submit(bidSubmission(aliceRequest.id, 'alice', 3));
  engine.submit(bidSubmission(bobRequest.id, 'bob', 4));

  const followup = engine.snapshotFor('alice').pending[0]!;
  assert.deepEqual(engine.submit({
    decisionId: followup.id,
    kind: 'continue',
    actorId: 'alice',
    stateVersion: 1,
    response: { acknowledge: true },
  }), { status: 'resolved', stateVersion: 2 });
  assert.deepEqual(engine.snapshotFor('alice').pending, []);
  assert.deepEqual(engine.snapshotFor('bob').pending, []);
});
