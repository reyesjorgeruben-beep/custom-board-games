/** Covers the stable lobby and signaling wire schemas that the coordination service accepts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  roomAccessSchema,
  roomSummarySchema,
  signalMessageSchema,
} from './lobby.ts';

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

test('keeps issued room capabilities separate from public summaries and signals', () => {
  const room = {
    roomId: 'r1', gameId: 'g1', hostId: 'p1', playerCount: 1,
    maxPlayers: 4, status: 'open' as const, version: 0,
  };
  const access = roomAccessSchema.parse({
    room,
    member: { playerId: 'p1', capability: 'a'.repeat(43) },
  });

  assert.equal(access.member.capability.length, 43);
  assert.throws(() => roomAccessSchema.parse({
    room,
    member: { playerId: 'p1', capability: 'short' },
  }));
  assert.throws(() => roomSummarySchema.parse({ ...room, capability: 'a'.repeat(43) }));
  assert.throws(() => signalMessageSchema.parse({
    id: 's1', roomId: 'r1', senderId: 'p1', recipientId: 'p2', kind: 'offer',
    payload: 'sdp', sequence: 1, expiresAt: 100, capability: 'a'.repeat(43),
  }));
});

test('rejects caller-supplied identities when creating or joining a room', () => {
  assert.deepEqual(createRoomRequestSchema.parse({ gameId: 'g1', maxPlayers: 4 }), {
    gameId: 'g1', maxPlayers: 4,
  });
  assert.throws(() => createRoomRequestSchema.parse({ gameId: 'g1', hostId: 'claimed', maxPlayers: 4 }));
  assert.deepEqual(joinRoomRequestSchema.parse({ roomId: 'r1' }), { roomId: 'r1' });
  assert.throws(() => joinRoomRequestSchema.parse({ roomId: 'r1', playerId: 'claimed' }));
});
