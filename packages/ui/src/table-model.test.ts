/** Covers composing an already available player snapshot into render-ready board, card, token, and decision data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayerSnapshot } from '@board-games/protocol';
import { composeTablePresentation } from './table-model.ts';

type Decisions = {
  choose: { context: { choices: string[] }; response: { choice: string } };
};

test('composes table visuals while preserving snapshot identity and pending decisions', () => {
  const snapshot: PlayerSnapshot<Decisions, { hand: string[] }> = {
    tableId: 'table-7',
    viewerId: 'player-2',
    stateVersion: 4,
    view: { hand: ['card-1'] },
    pending: [{
      id: 'decision-8',
      tableId: 'table-7',
      kind: 'choose',
      actorId: 'player-2',
      stateVersion: 4,
      context: { choices: ['north', 'south'] },
    }],
  };

  const model = composeTablePresentation(snapshot, ({ view }) => ({
    title: `Cards in hand: ${view.hand.length}`,
    boards: [{ id: 'map', label: 'Map', columns: 8, rows: 6 }],
    cards: [{ id: view.hand[0]!, title: 'Scout', face: 'front', selected: true }],
    tokens: [{ id: 'marker-1', label: 'Player 2', color: 'blue', position: { boardId: 'map', x: 2, y: 3 } }],
    customVisuals: [],
  }));

  assert.deepEqual(model, {
    tableId: 'table-7',
    viewerId: 'player-2',
    stateVersion: 4,
    title: 'Cards in hand: 1',
    boards: [{ id: 'map', label: 'Map', columns: 8, rows: 6 }],
    cards: [{ id: 'card-1', title: 'Scout', face: 'front', selected: true }],
    tokens: [{ id: 'marker-1', label: 'Player 2', color: 'blue', position: { boardId: 'map', x: 2, y: 3 } }],
    customVisuals: [],
    pendingDecisions: snapshot.pending,
  });
});
