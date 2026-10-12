/** Covers runtime rejection of unknown kinds, malformed responses, and valid typed decisions at the trust boundary. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createDecisionProtocol } from './decision.ts';

const protocol = createDecisionProtocol({
  choose: {
    context: z.object({ options: z.array(z.string()) }).strict(),
    response: z.object({ selected: z.string() }).strict(),
  },
  bid: {
    context: z.object({ maximum: z.number().int() }).strict(),
    response: z.object({ amount: z.number().int() }).strict(),
  },
});

test('parses a decision request with the matching context', () => {
  const request = protocol.parseRequest({
    id: 'd1', tableId: 't1', kind: 'choose', actorId: 'p1', stateVersion: 2,
    context: { options: ['a', 'b'] },
  });
  assert.equal(request.kind, 'choose');
  if (request.kind === 'choose') assert.deepEqual(request.context.options, ['a', 'b']);
});

test('rejects an unknown decision kind', () => {
  assert.throws(() => protocol.parseSubmission({
    decisionId: 'd1', kind: 'other', actorId: 'p1', stateVersion: 2,
    response: {},
  }));
});

test('rejects a response that does not match its kind', () => {
  assert.throws(() => protocol.parseSubmission({
    decisionId: 'd1', kind: 'bid', actorId: 'p1', stateVersion: 2,
    response: { selected: 'a' },
  }));
});

test('rejects extra envelope fields before a submission reaches game logic', () => {
  assert.throws(() => protocol.parseSubmission({
    decisionId: 'd1', kind: 'choose', actorId: 'p1', stateVersion: 2,
    response: { selected: 'a' }, extraField: 'untrusted',
  }));
});
