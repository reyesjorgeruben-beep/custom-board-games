/** Covers room lifecycle, metadata privacy, and bounded recipient-scoped signaling behavior. */
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

  async loadSignals(_query: SignalQuery): Promise<readonly unknown[]> {
    return this.signals;
  }
}

function createHarness(options: { readonly now?: () => number; readonly ids?: readonly string[] } = {}) {
  const repository = new MemoryCoordinationRepository();
  const ids = [...(options.ids ?? ['room-1', 'signal-1'])];
  const service = createCoordinationService(repository, {
    now: options.now ?? (() => 1_000),
    createId: () => ids.shift() ?? 'unexpected-id',
  });

  return { repository, service };
}

async function createRoom(
  service: ReturnType<typeof createCoordinationService>,
  hostId = 'host-1',
  maxPlayers = 3,
) {
  return service.createRoom({ gameId: 'game-1', hostId, maxPlayers });
}

test('creates a room with public metadata and host membership but no game state', async () => {
  const { repository, service } = createHarness();

  const room = await createRoom(service);

  assert.deepEqual(room, {
    roomId: 'room-1', gameId: 'game-1', hostId: 'host-1', playerCount: 1,
    maxPlayers: 3, status: 'open', version: 0,
  });
  assert.deepEqual(repository.rooms.get('room-1')?.memberIds, ['host-1']);
  assert.equal('gameState' in room, false);
});

test('rejects game state fields in room creation input', async () => {
  const { service } = createHarness();

  await assert.rejects(
    service.createRoom({ gameId: 'game-1', hostId: 'host-1', maxPlayers: 3, gameState: { secret: true } }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
});

test('lists open public summaries without exposing participant records', async () => {
  const { repository, service } = createHarness({ ids: ['room-1', 'room-2'] });
  await createRoom(service);
  await createRoom(service, 'host-2');
  const closed = repository.rooms.get('room-2');
  assert.ok(closed);
  await repository.saveRoom({
    ...closed,
    summary: { ...closed.summary, status: 'closed' },
  });

  const rooms = await service.listRooms();

  assert.deepEqual(rooms, [{
    roomId: 'room-1', gameId: 'game-1', hostId: 'host-1', playerCount: 1,
    maxPlayers: 3, status: 'open', version: 0,
  }]);
  assert.equal('memberIds' in rooms[0]!, false);
});

test('joins an open room and rejects an additional member at capacity', async () => {
  const { service } = createHarness();
  await createRoom(service, 'host-1', 2);

  const joined = await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });

  assert.equal(joined.playerCount, 2);
  assert.equal(joined.version, 1);
  await assert.rejects(
    service.joinRoom({ roomId: 'room-1', playerId: 'guest-2' }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'ROOM_FULL',
  );
});

test('joining twice is idempotent and does not consume another seat', async () => {
  const { service } = createHarness();
  await createRoom(service, 'host-1', 2);
  await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });

  const joinedAgain = await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });

  assert.equal(joinedAgain.playerCount, 2);
  assert.equal(joinedAgain.version, 1);
});

test('removes a departing guest and deletes the room when its host leaves', async () => {
  const { repository, service } = createHarness();
  await createRoom(service);
  await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });

  const remaining = await service.leaveRoom({ roomId: 'room-1', playerId: 'guest-1' });
  assert.ok(remaining);
  await service.leaveRoom({ roomId: 'room-1', playerId: 'host-1' });

  assert.equal(remaining.playerCount, 1);
  assert.equal(remaining.version, 2);
  assert.equal(repository.rooms.has('room-1'), false);
});

test('stores only valid signals addressed between members with bounded size and lifetime', async () => {
  const { repository, service } = createHarness();
  await createRoom(service);
  await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });

  const stored = await service.sendSignal({
    id: 'signal-1', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-1',
    kind: 'offer', payload: 'sdp-offer', sequence: 0, expiresAt: 2_000,
  });

  assert.equal(stored.expiresAt, 2_000);
  assert.equal(repository.signals.length, 1);
  await assert.rejects(
    service.sendSignal({
      id: 'signal-2', roomId: 'room-1', senderId: 'host-1', recipientId: 'missing',
      kind: 'offer', payload: 'sdp-offer', sequence: 1, expiresAt: 2_000,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_SIGNAL_TARGET',
  );
  await assert.rejects(
    service.sendSignal({
      id: 'signal-3', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-1',
      kind: 'offer', payload: 'x'.repeat(16_385), sequence: 2, expiresAt: 2_000,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'SIGNAL_TOO_LARGE',
  );
  await assert.rejects(
    service.sendSignal({
      id: 'signal-4', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-1',
      kind: 'offer', payload: 'sdp-offer', sequence: 3, expiresAt: 121_001,
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'SIGNAL_LIFETIME_EXCEEDED',
  );
});

test('receives only unexpired signals for the requested room and recipient within the requested page', async () => {
  let now = 1_000;
  const { repository, service } = createHarness({ now: () => now, ids: ['room-1', 'room-2'] });
  await createRoom(service);
  await service.joinRoom({ roomId: 'room-1', playerId: 'guest-1' });
  await service.joinRoom({ roomId: 'room-1', playerId: 'guest-2' });
  await createRoom(service, 'host-2');
  await service.joinRoom({ roomId: 'room-2', playerId: 'guest-1' });
  await service.sendSignal({
    id: 'expired', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-1',
    kind: 'offer', payload: 'first', sequence: 0, expiresAt: 1_001,
  });
  await service.sendSignal({
    id: 'same-room-second', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-1',
    kind: 'ice-candidate', payload: 'second', sequence: 1, expiresAt: 2_000,
  });
  await service.sendSignal({
    id: 'other-recipient', roomId: 'room-1', senderId: 'host-1', recipientId: 'guest-2',
    kind: 'answer', payload: 'wrong recipient', sequence: 2, expiresAt: 2_000,
  });
  await service.sendSignal({
    id: 'other-room', roomId: 'room-2', senderId: 'host-2', recipientId: 'guest-1',
    kind: 'offer', payload: 'other-room', sequence: 2, expiresAt: 2_000,
  });
  now = 1_002;

  const signals = await service.receiveSignals({ roomId: 'room-1', recipientId: 'guest-1', limit: 1 });

  assert.deepEqual(signals.map(({ id }) => id), ['same-room-second']);
  assert.deepEqual(repository.signals.map(({ id }) => id), [
    'expired', 'same-room-second', 'other-recipient', 'other-room',
  ]);
});
