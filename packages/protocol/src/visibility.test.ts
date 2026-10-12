/** Covers public, private, team, and host-only audience checks used by player projections. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isVisibleTo, visibilityAudienceSchema } from './visibility.ts';

test('public content is visible to every participant', () => {
  assert.equal(isVisibleTo({ kind: 'public' }, { playerId: 'p1' }), true);
});

test('private content is limited to listed players', () => {
  assert.equal(isVisibleTo({ kind: 'players', playerIds: ['p1'] }, { playerId: 'p2' }), false);
});

test('team content requires a matching team', () => {
  assert.equal(isVisibleTo({ kind: 'team', teamId: 'red' }, { playerId: 'p1', teamId: 'red' }), true);
  assert.equal(isVisibleTo({ kind: 'team', teamId: 'red' }, { playerId: 'p2' }), false);
});

test('host-only content is not visible to a guest', () => {
  assert.equal(isVisibleTo({ kind: 'host' }, { playerId: 'p1', isHost: false }), false);
});

test('rejects malformed audience data before projection', () => {
  assert.throws(() => visibilityAudienceSchema.parse({ kind: 'team', teamId: 'red', playerIds: ['p1'] }));
});
