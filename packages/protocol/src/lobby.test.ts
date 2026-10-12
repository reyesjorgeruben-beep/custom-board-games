/** Covers the stable lobby and signaling wire schemas that the coordination service accepts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roomSummarySchema, signalMessageSchema } from './lobby.ts';

test('accepts public room metadata without game state', () => {
  const room = roomSummarySchema.parse({
    roomId: 'r1', gameId: 'g1', hostId: 'p1', playerCount: 1,
    maxPlayers: 4, status: 'open', version: 0,
  });
  assert.equal(room.gameId, 'g1');
});

test('rejects hidden game state in public room metadata', () => {
  assert.throws(() => roomSummarySchema.parse({
    roomId: 'r1', gameId: 'g1', hostId: 'p1', playerCount: 1,
    maxPlayers: 4, status: 'open', version: 0, deck: ['secret'],
  }));
});

test('rejects a room whose player count exceeds capacity', () => {
  assert.throws(() => roomSummarySchema.parse({
    roomId: 'r1', gameId: 'g1', hostId: 'p1', playerCount: 5,
    maxPlayers: 4, status: 'open', version: 0,
  }));
});

test('rejects signaling messages without a recipient', () => {
  assert.throws(() => signalMessageSchema.parse({
    id: 's1', roomId: 'r1', senderId: 'p1', kind: 'offer',
    payload: 'sdp', sequence: 1, expiresAt: 100,
  }));
});
