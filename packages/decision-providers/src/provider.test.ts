/** Covers human input capture and bot handlers producing the same correlated decision submission contract. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecisionRequestFor } from '@board-games/protocol';
import { createBotDecisionProvider, createHumanDecisionProvider } from './index.ts';

type HumanDecisions = {
  choose: { context: { choices: string[] }; response: { choice: string } };
};

type GameDecisions = {
  choose: { context: { choices: string[] }; response: { choice: string } };
  bid: { context: { maximum: number }; response: { amount: number } };
};

test('human capture receives its request and returns a submission with matching correlation fields', async () => {
  const request: DecisionRequestFor<HumanDecisions, 'choose'> = {
    id: 'decision-1',
    tableId: 'table-1',
    kind: 'choose',
    actorId: 'player-1',
    stateVersion: 3,
    context: { choices: ['red', 'green'] },
  };
  let capturedRequest: DecisionRequestFor<HumanDecisions, 'choose'> | undefined;
  const provider = createHumanDecisionProvider<HumanDecisions>(async (received) => {
    capturedRequest = received;
    return { choice: 'green' };
  });

  const submission = await provider.provide(request);

  assert.equal(capturedRequest, request);
  assert.deepEqual(submission, {
    decisionId: 'decision-1',
    kind: 'choose',
    actorId: 'player-1',
    stateVersion: 3,
    response: { choice: 'green' },
  });
});

test('bot provider invokes the handler for the request kind and returns its typed response', async () => {
  const provider = createBotDecisionProvider<GameDecisions>({
    choose: (request) => ({ choice: request.context.choices[0]! }),
    bid: (request) => ({ amount: request.context.maximum }),
  });
  const request: DecisionRequestFor<GameDecisions, 'bid'> = {
    id: 'decision-2',
    tableId: 'table-1',
    kind: 'bid',
    actorId: 'bot-1',
    stateVersion: 5,
    context: { maximum: 7 },
  };

  const submission = await provider.provide(request);

  assert.deepEqual(submission, {
    decisionId: 'decision-2',
    kind: 'bid',
    actorId: 'bot-1',
    stateVersion: 5,
    response: { amount: 7 },
  });
});
