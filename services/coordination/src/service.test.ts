/** Covers caller-bound room capabilities and recipient-scoped signaling behavior. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCoordinationService,
  CoordinationError,
  type CoordinationRepository,
  type StoredRoom,
  type SignalQuery,
} from './service.ts';
import type { SignalMessage } from '@board-games/protocol';

class MemoryCoordinationRepository implements CoordinationRepository {
  readonly rooms = new Map<string, StoredRoom>();
  readonly signals: SignalMessage[] = [];

  async loadRoom(roomId: string): Promise<unknown> {
    return this.rooms.get(roomId);
  }

  async loadRooms(limit: number): Promise<readonly unknown[]> {
    return [...this.rooms.values()].slice(0, limit);
  }

  async saveRoom(room: StoredRoom): Promise<void> {
    this.rooms.set(room.summary.roomId, room);
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async storeSignal(message: SignalMessage): Promise<void> {
    this.signals.push(message);
  }

  async loadSignals(query: SignalQuery): Promise<readonly unknown[]> {
    return this.signals.filter((message) => (
      message.roomId === query.roomId
      && message.recipientId === query.recipientId
      && message.sequence > query.afterSequence
    ));
  }
}

function createHarness(options: { readonly now?: () => number; readonly ids?: readonly string[] } = {}) {
  const repository = new MemoryCoordinationRepository();
  const ids = [...(options.ids ?? ['room-1', 'host-1', 'signal-1'])];
  let fallbackId = 0;
  const service = createCoordinationService(repository, {
    now: options.now ?? (() => 1_000),
    createId: () => ids.shift() ?? `generated-${fallbackId++}`,
  });

  return { repository, service };
}

async function createRoom(
  service: ReturnType<typeof createCoordinationService>,
  maxPlayers = 3,
) {
  return service.createRoom({ gameId: 'game-1', maxPlayers });
}

test('creates a room with a server-assigned host identity and stores only its capability hash', async () => {
  const { repository, service } = createHarness();

  const host = await createRoom(service);
  const stored = repository.rooms.get(host.room.roomId);

  assert.ok(stored);
  assert.equal(host.room.hostId, host.member.playerId);
  assert.equal(host.room.hostId, 'host-1');
  assert.equal(host.member.capability.length, 43);
  assert.equal('capability' in host.room, false);
  assert.equal(stored.members[0]?.playerId, host.member.playerId);
  assert.equal(stored.members[0]?.capabilityHash.length, 64);
  assert.equal('capability' in stored.members[0]!, false);
});

test('rejects client-supplied host identity claims', async () => {
  const { service } = createHarness();

  await assert.rejects(
    service.createRoom({ gameId: 'game-1', hostId: 'claimed-host', maxPlayers: 3 }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
});

test('lists open public summaries without exposing participant credentials', async () => {
  const { repository, service } = createHarness({ ids: ['room-1', 'host-1', 'room-2', 'host-2'] });
  const first = await createRoom(service);
  const second = await createRoom(service);
  const closed = repository.rooms.get(second.room.roomId);
  assert.ok(closed);
  await repository.saveRoom({ ...closed, summary: { ...closed.summary, status: 'closed' } });

  const rooms = await service.listRooms();

  assert.deepEqual(rooms, [first.room]);
  assert.equal('members' in rooms[0]!, false);
  assert.equal('capability' in rooms[0]!, false);
});

test('joins an open room with a fresh server-assigned player identity and rejects capacity overflow', async () => {
  const { service } = createHarness();
  const host = await createRoom(service, 2);

  const joined = await service.joinRoom({ roomId: host.room.roomId });

  assert.notEqual(joined.member.playerId, host.member.playerId);
  assert.notEqual(joined.member.capability, host.member.capability);
  assert.equal(joined.room.playerCount, 2);
  assert.equal(joined.room.version, 1);
  await assert.rejects(
    service.joinRoom({ roomId: host.room.roomId }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'ROOM_FULL',
  );
});

test('rejects a client-supplied player identity claim during join', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);

  await assert.rejects(
    service.joinRoom({ roomId: host.room.roomId, playerId: host.member.playerId }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
  assert.deepEqual(repository.rooms.get(host.room.roomId)?.members.map(({ playerId }) => playerId), [
    host.member.playerId,
  ]);
});

test('removes the caller identified by capability and deletes the room only when its host leaves', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);
  const guest = await service.joinRoom({ roomId: host.room.roomId });

  await assert.rejects(
    service.leaveRoom({ roomId: host.room.roomId, capability: `${'z'.repeat(43)}` }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'UNAUTHORIZED',
  );
  const remaining = await service.leaveRoom({ roomId: host.room.roomId, capability: guest.member.capability });
  assert.ok(remaining);
  await assert.rejects(
    service.leaveRoom({ roomId: host.room.roomId, capability: guest.member.capability, playerId: host.member.playerId }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
  await service.leaveRoom({ roomId: host.room.roomId, capability: host.member.capability });

  assert.equal(remaining.playerCount, 1);
  assert.equal(remaining.version, 2);
  assert.equal(repository.rooms.has(host.room.roomId), false);
});

test('rejects unauthorized callers and sender identity claims before storing signals', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);
  const guest = await service.joinRoom({ roomId: host.room.roomId });
  const request = {
    roomId: host.room.roomId,
    capability: guest.member.capability,
    recipientId: host.member.playerId,
    kind: 'offer' as const,
    payload: 'sdp-offer',
    sequence: 0,
    expiresAt: 2_000,
  };

  await assert.rejects(
    service.sendSignal({ ...request, capability: `${'z'.repeat(43)}` }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'UNAUTHORIZED',
  );
  await assert.rejects(
    service.sendSignal({ ...request, senderId: host.member.playerId }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
  assert.equal(repository.signals.length, 0);
});

test('stores only valid signals between distinct members and enforces size and lifetime limits', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);
  const guest = await service.joinRoom({ roomId: host.room.roomId });

  const stored = await service.sendSignal({
    roomId: host.room.roomId, capability: host.member.capability, recipientId: guest.member.playerId,
    kind: 'offer', payload: 'sdp-offer', sequence: 0, expiresAt: 2_000,
  });

  assert.equal(stored.expiresAt, 2_000);
  assert.equal(stored.senderId, host.member.playerId);
  assert.equal('capability' in stored, false);
  assert.equal(repository.signals.length, 1);
  await assert.rejects(
    service.sendSignal({
      roomId: host.room.roomId, capability: host.member.capability, recipientId: 'missing',
      kind: 'offer', payload: 'sdp-offer', sequence: 1, expiresAt: 2_000,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_SIGNAL_TARGET',
  );
  await assert.rejects(
    service.sendSignal({
      roomId: host.room.roomId, capability: host.member.capability, recipientId: guest.member.playerId,
      kind: 'offer', payload: 'x'.repeat(16_385), sequence: 2, expiresAt: 2_000,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'SIGNAL_TOO_LARGE',
  );
  await assert.rejects(
    service.sendSignal({
      roomId: host.room.roomId, capability: host.member.capability, recipientId: guest.member.playerId,
      kind: 'offer', payload: 'sdp-offer', sequence: 3, expiresAt: 121_001,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'SIGNAL_LIFETIME_EXCEEDED',
  );
});

test('polls only the caller member inbox and rejects recipient identity claims', async () => {
  let now = 1_000;
  const { service } = createHarness({ now: () => now, ids: ['room-1', 'host-1', 'room-2', 'host-2'] });
  const firstHost = await createRoom(service);
  const firstGuest = await service.joinRoom({ roomId: firstHost.room.roomId });
  const secondGuest = await service.joinRoom({ roomId: firstHost.room.roomId });
  const secondHost = await createRoom(service);
  const otherRoomGuest = await service.joinRoom({ roomId: secondHost.room.roomId });
  await service.sendSignal({
    roomId: firstHost.room.roomId, capability: firstHost.member.capability,
    recipientId: firstGuest.member.playerId, kind: 'offer', payload: 'first', sequence: 0, expiresAt: 1_001,
  });
  await service.sendSignal({
    roomId: firstHost.room.roomId, capability: firstHost.member.capability,
    recipientId: firstGuest.member.playerId, kind: 'ice-candidate', payload: 'second', sequence: 1, expiresAt: 2_000,
  });
  await service.sendSignal({
    roomId: firstHost.room.roomId, capability: firstHost.member.capability,
    recipientId: secondGuest.member.playerId, kind: 'answer', payload: 'other recipient', sequence: 2, expiresAt: 2_000,
  });
  await service.sendSignal({
    roomId: secondHost.room.roomId, capability: secondHost.member.capability,
    recipientId: otherRoomGuest.member.playerId, kind: 'offer', payload: 'other room', sequence: 0, expiresAt: 2_000,
  });
  now = 1_002;

  const ownSignals = await service.receiveSignals({
    roomId: firstHost.room.roomId, capability: firstGuest.member.capability, limit: 1,
  });
  const secondInbox = await service.receiveSignals({
    roomId: firstHost.room.roomId, capability: secondGuest.member.capability,
  });

  assert.deepEqual(ownSignals.map(({ payload }) => payload), ['second']);
  assert.deepEqual(secondInbox.map(({ payload }) => payload), ['other recipient']);
  await assert.rejects(
    service.receiveSignals({
      roomId: firstHost.room.roomId, capability: secondGuest.member.capability, recipientId: firstGuest.member.playerId,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
  await assert.rejects(
    service.receiveSignals({ roomId: firstHost.room.roomId, capability: `${'z'.repeat(43)}` }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'UNAUTHORIZED',
  );
});
