/** Covers caller-bound room capabilities and recipient-scoped signaling behavior. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  createCoordinationService,
  CoordinationError,
  MAX_RETAINED_JOIN_REQUESTS_PER_ROOM,
  type CoordinationRepository,
  type LeaveMemberCommit,
  type JoinRoomCommit,
  type CreateRoomCommit,
  type StoredMember,
  type StoredRoom,
  type SignalQuery,
} from './service.ts';
import type { SignalMessage } from '@board-games/protocol';

/** Applies each conditional room mutation before yielding, modeling one atomic repository commit. */
class MemoryCoordinationRepository implements CoordinationRepository {
  readonly rooms = new Map<string, StoredRoom>();
  readonly createRequests = new Map<string, {
    readonly fingerprint: string;
    readonly roomId: string;
    readonly expiresAt: number;
    status: 'active' | 'retired';
  }>();
  readonly signals: SignalMessage[] = [];

  async loadRoom(roomId: string): Promise<unknown> {
    return this.rooms.get(roomId);
  }

  async loadRooms(limit: number): Promise<readonly unknown[]> {
    return [...this.rooms.values()].slice(0, limit);
  }

  async createRoomIfAbsent(room: StoredRoom, now: number): Promise<CreateRoomCommit> {
    const previous = this.createRequests.get(room.createRequestHash);
    if (previous !== undefined && previous.expiresAt > now) {
      if (previous.fingerprint !== room.createRequestFingerprint) {
        return { outcome: 'idempotency-key-reused' };
      }
      if (previous.status === 'retired') return { outcome: 'retired' };
      const existingRoom = this.rooms.get(previous.roomId);
      return existingRoom === undefined
        ? { outcome: 'retired' }
        : { outcome: 'replayed', room: existingRoom };
    }

    if (previous !== undefined) this.createRequests.delete(room.createRequestHash);
    if (this.rooms.has(room.summary.roomId)) return { outcome: 'room-id-collision' };

    this.rooms.set(room.summary.roomId, room);
    this.createRequests.set(room.createRequestHash, {
      fingerprint: room.createRequestFingerprint,
      roomId: room.summary.roomId,
      expiresAt: room.createRequestExpiresAt,
      status: 'active',
    });
    return { outcome: 'created', room };
  }

  async joinRoomIfOpen(roomId: string, member: StoredMember): Promise<JoinRoomCommit> {
    const room = this.rooms.get(roomId);
    if (room === undefined) return { outcome: 'not-found' };

    const existingMember = room.members.find(({ joinRequestHash }) => (
      joinRequestHash === member.joinRequestHash
    ));
    if (existingMember !== undefined) return { outcome: 'replayed', room };
    if (room.retiredJoinRequestHashes.includes(member.joinRequestHash ?? '')) {
      return { outcome: 'retired' };
    }
    if (room.summary.status !== 'open') return { outcome: 'not-open' };
    if (room.members.length >= room.summary.maxPlayers) return { outcome: 'full' };

    const retainedJoinRequests = room.retiredJoinRequestHashes.length
      + room.members.filter(({ joinRequestHash }) => joinRequestHash !== undefined).length;
    if (retainedJoinRequests >= MAX_RETAINED_JOIN_REQUESTS_PER_ROOM) return { outcome: 'history-full' };
    if (room.members.some(({ playerId }) => playerId === member.playerId)) {
      return { outcome: 'player-id-collision' };
    }
    if (room.members.some(({ capabilityHash }) => capabilityHash === member.capabilityHash)) {
      return { outcome: 'capability-collision' };
    }

    const members = [...room.members, member];
    const joinedRoom: StoredRoom = {
      ...room,
      summary: {
        ...room.summary,
        playerCount: members.length,
        version: room.summary.version + 1,
      },
      members,
    };
    this.rooms.set(roomId, joinedRoom);
    return { outcome: 'joined', room: joinedRoom };
  }

  async leaveMember(
    roomId: string,
    playerId: string,
    authenticatedCapabilityHash: string,
    now: number,
  ): Promise<LeaveMemberCommit> {
    const room = this.rooms.get(roomId);
    if (room === undefined) return { outcome: 'not-found' };
    const member = room.members.find(({ playerId: id, capabilityHash }) => (
      id === playerId && capabilityHash === authenticatedCapabilityHash
    ));
    if (member === undefined) return { outcome: 'member-not-found' };

    if (playerId === room.summary.hostId) {
      const createRequest = this.createRequests.get(room.createRequestHash);
      if (
        room.createRequestExpiresAt > now
        && createRequest?.roomId === roomId
        && createRequest.status === 'active'
      ) {
        createRequest.status = 'retired';
      }
      this.rooms.delete(roomId);
      return { outcome: 'room-deleted' };
    }

    const members = room.members.filter(({ playerId: id }) => id !== playerId);
    const retiredJoinRequestHashes = member.joinRequestHash === undefined
      ? room.retiredJoinRequestHashes
      : [...room.retiredJoinRequestHashes, member.joinRequestHash];
    const leftRoom: StoredRoom = {
      ...room,
      summary: {
        ...room.summary,
        playerCount: members.length,
        version: room.summary.version + 1,
      },
      members,
      retiredJoinRequestHashes,
    };
    this.rooms.set(roomId, leftRoom);
    return { outcome: 'left', room: leftRoom };
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
  const capabilityDerivationKey = randomBytes(32);
  const service = createCoordinationService(repository, {
    now: options.now ?? (() => 1_000),
    createId: () => ids.shift() ?? `generated-${fallbackId++}`,
    capabilityDerivationKey,
  });

  return { repository, service, capabilityDerivationKey };
}

async function createRoom(
  service: ReturnType<typeof createCoordinationService>,
  maxPlayers = 3,
) {
  return service.createRoom({ gameId: 'game-1', maxPlayers, idempotencyKey: createIdempotencyKey() });
}

function createIdempotencyKey(): string {
  return randomBytes(32).toString('base64url');
}

function joinRoom(service: ReturnType<typeof createCoordinationService>, roomId: string) {
  return service.joinRoom({ roomId, idempotencyKey: createIdempotencyKey() });
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
    service.createRoom({
      gameId: 'game-1', hostId: 'claimed-host', maxPlayers: 3, idempotencyKey: createIdempotencyKey(),
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
});

test('lists open public summaries without exposing participant credentials', async () => {
  const { repository, service } = createHarness({ ids: ['room-1', 'host-1', 'room-2', 'host-2'] });
  const first = await createRoom(service);
  const second = await createRoom(service);
  const closed = repository.rooms.get(second.room.roomId);
  assert.ok(closed);
  repository.rooms.set(second.room.roomId, { ...closed, summary: { ...closed.summary, status: 'closed' } });

  const rooms = await service.listRooms();

  assert.deepEqual(rooms, [first.room]);
  assert.equal('members' in rooms[0]!, false);
  assert.equal('capability' in rooms[0]!, false);
});

test('joins an open room with a fresh server-assigned player identity and rejects capacity overflow', async () => {
  const { service } = createHarness();
  const host = await createRoom(service, 2);

  const joined = await joinRoom(service, host.room.roomId);

  assert.notEqual(joined.member.playerId, host.member.playerId);
  assert.notEqual(joined.member.capability, host.member.capability);
  assert.equal(joined.room.playerCount, 2);
  assert.equal(joined.room.version, 1);
  await assert.rejects(
    joinRoom(service, host.room.roomId),
    (error: unknown) => error instanceof CoordinationError && error.code === 'ROOM_FULL',
  );
});

test('allows only one of two simultaneous joins for the final seat', async () => {
  const { repository, service } = createHarness({ ids: ['room-1', 'host-1', 'guest-1', 'guest-2'] });
  const host = await createRoom(service, 2);

  const results = await Promise.allSettled([
    joinRoom(service, host.room.roomId),
    joinRoom(service, host.room.roomId),
  ]);
  const joined = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(joined.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.status === 'rejected');
  assert.ok(rejected[0].reason instanceof CoordinationError);
  assert.equal(rejected[0].reason.code, 'ROOM_FULL');
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.summary.playerCount, 2);
  assert.equal(stored.members.length, 2);
});

test('retains both simultaneous joins when two seats are available', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 3);

  const [first, second] = await Promise.all([
    joinRoom(service, host.room.roomId),
    joinRoom(service, host.room.roomId),
  ]);

  assert.notEqual(first.member.playerId, second.member.playerId);
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.summary.playerCount, 3);
  assert.equal(stored.summary.version, 2);
  assert.equal(stored.members.length, 3);
  assert.ok(stored.members.some(({ playerId }) => playerId === first.member.playerId));
  assert.ok(stored.members.some(({ playerId }) => playerId === second.member.playerId));
});

test('replays concurrent room creation with one idempotency key and rejects changed settings', async () => {
  const { repository, service } = createHarness();
  const idempotencyKey = createIdempotencyKey();
  const request = { gameId: 'game-1', maxPlayers: 3, idempotencyKey };

  const [created, replayed] = await Promise.all([
    service.createRoom(request),
    service.createRoom(request),
  ]);

  assert.deepEqual(replayed, created);
  assert.equal(repository.rooms.size, 1);
  const stored = repository.rooms.get(created.room.roomId);
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).includes(idempotencyKey), false);
  assert.equal(JSON.stringify(stored).includes(created.member.capability), false);
  await assert.rejects(
    service.createRoom({ ...request, maxPlayers: 4 }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(repository.rooms.size, 1);
  assert.equal(repository.createRequests.has(idempotencyKey), false);
});

test('reconstructs the same create capability in another service instance', async () => {
  const { repository, service, capabilityDerivationKey } = createHarness();
  const request = { gameId: 'game-1', maxPlayers: 3, idempotencyKey: createIdempotencyKey() };
  const created = await service.createRoom(request);
  let nextId = 0;
  const restartedService = createCoordinationService(repository, {
    now: () => 1_000,
    createId: () => `retry-generated-${nextId++}`,
    capabilityDerivationKey,
  });

  const replayed = await restartedService.createRoom(request);

  assert.deepEqual(replayed, created);
});

test('rejects create and join replay when a stored verifier does not match the derived credential', async () => {
  const { repository, service } = createHarness();
  const createRequest = { gameId: 'game-1', maxPlayers: 3, idempotencyKey: createIdempotencyKey() };
  const created = await service.createRoom(createRequest);
  const createRecord = repository.rooms.get(created.room.roomId);
  assert.ok(createRecord);
  repository.rooms.set(created.room.roomId, {
    ...createRecord,
    members: createRecord.members.map((member) => ({
      ...member,
      capabilityHash: createHash('sha256').update('invalid stored verifier').digest('hex'),
    })),
  });
  await assert.rejects(
    service.createRoom(createRequest),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_STORED_ROOM',
  );

  const host = await createRoom(service);
  const joinRequest = { roomId: host.room.roomId, idempotencyKey: createIdempotencyKey() };
  const joined = await service.joinRoom(joinRequest);
  const joinRecord = repository.rooms.get(host.room.roomId);
  assert.ok(joinRecord);
  repository.rooms.set(host.room.roomId, {
    ...joinRecord,
    members: joinRecord.members.map((member) => member.playerId === joined.member.playerId
      ? { ...member, capabilityHash: createHash('sha256').update('invalid stored join verifier').digest('hex') }
      : member),
  });
  await assert.rejects(
    service.joinRoom(joinRequest),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_STORED_ROOM',
  );
});

test('replays a retried join with the same member capability without consuming a seat', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 2);
  const request = { roomId: host.room.roomId, idempotencyKey: createIdempotencyKey() };

  const joined = await service.joinRoom(request);
  const replayed = await service.joinRoom(request);

  assert.deepEqual(replayed, joined);
  assert.equal(replayed.member.playerId, joined.member.playerId);
  assert.equal(replayed.member.capability, joined.member.capability);
  assert.equal(replayed.room.playerCount, 2);
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.members.length, 2);
  assert.equal(JSON.stringify(stored).includes(request.idempotencyKey), false);
  assert.equal(JSON.stringify(stored).includes(joined.member.capability), false);
});

test('replays simultaneous duplicate joins when only one seat remains', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 2);
  const request = { roomId: host.room.roomId, idempotencyKey: createIdempotencyKey() };

  const results = await Promise.all([
    service.joinRoom(request),
    service.joinRoom(request),
  ]);

  assert.deepEqual(results[0], results[1]);
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.summary.playerCount, 2);
  assert.equal(stored.members.length, 2);
});

test('replays an active join before enforcing the bounded room history limit', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 3);
  const request = { roomId: host.room.roomId, idempotencyKey: createIdempotencyKey() };
  const joined = await service.joinRoom(request);
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  repository.rooms.set(host.room.roomId, {
    ...stored,
    retiredJoinRequestHashes: Array.from(
      { length: MAX_RETAINED_JOIN_REQUESTS_PER_ROOM - 1 },
      (_, index) => index.toString(16).padStart(64, '0'),
    ),
  });

  const replayed = await service.joinRoom(request);
  assert.equal(replayed.member.capability, joined.member.capability);
  await assert.rejects(
    joinRoom(service, host.room.roomId),
    (error: unknown) => error instanceof CoordinationError && error.code === 'IDEMPOTENCY_HISTORY_FULL',
  );
});

test('retires a join idempotency key when its member leaves', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 2);
  const request = { roomId: host.room.roomId, idempotencyKey: createIdempotencyKey() };
  const joined = await service.joinRoom(request);

  await service.leaveRoom({ roomId: host.room.roomId, capability: joined.member.capability });

  await assert.rejects(
    service.joinRoom(request),
    (error: unknown) => error instanceof CoordinationError && error.code === 'IDEMPOTENCY_KEY_RETIRED',
  );
  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.summary.playerCount, 1);
  assert.equal(stored.members.length, 1);
  assert.equal(stored.retiredJoinRequestHashes.length, 1);
});

test('keeps a concurrent join when another member leaves', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service, 3);
  const departing = await joinRoom(service, host.room.roomId);
  const [joined] = await Promise.all([
    joinRoom(service, host.room.roomId),
    service.leaveRoom({ roomId: host.room.roomId, capability: departing.member.capability }),
  ]);

  const stored = repository.rooms.get(host.room.roomId);
  assert.ok(stored);
  assert.equal(stored.summary.playerCount, 2);
  assert.equal(stored.summary.version, 3);
  assert.equal(stored.members.length, 2);
  assert.ok(stored.members.some(({ playerId }) => playerId === host.member.playerId));
  assert.ok(stored.members.some(({ playerId }) => playerId === joined.member.playerId));
  assert.deepEqual(stored.retiredJoinRequestHashes.length, 1);
});

test('does not let a stale leave verifier remove a rejoined member with the same player ID', async () => {
  const { repository, service } = createHarness({
    ids: ['room-1', 'host-1', 'reused-player', 'reused-player'],
  });
  const host = await createRoom(service, 3);
  const originalMember = await joinRoom(service, host.room.roomId);
  const originalRoom = repository.rooms.get(host.room.roomId);
  assert.ok(originalRoom);
  const originalVerifier = originalRoom.members.find(({ playerId }) => (
    playerId === originalMember.member.playerId
  ))?.capabilityHash;
  assert.ok(originalVerifier);

  const loadRoom = repository.loadRoom.bind(repository);
  let capturedRead!: () => void;
  let releaseRead!: () => void;
  const captured = new Promise<void>((resolve) => { capturedRead = resolve; });
  const waiting = new Promise<void>((resolve) => { releaseRead = resolve; });
  let pauseNextRead = true;
  repository.loadRoom = async (roomId) => {
    const room = await loadRoom(roomId);
    if (pauseNextRead) {
      pauseNextRead = false;
      capturedRead();
      await waiting;
    }
    return room;
  };

  const staleLeave = service.leaveRoom({
    roomId: host.room.roomId,
    capability: originalMember.member.capability,
  });
  await captured;
  await service.leaveRoom({ roomId: host.room.roomId, capability: originalMember.member.capability });
  const replacement = await joinRoom(service, host.room.roomId);
  assert.equal(replacement.member.playerId, originalMember.member.playerId);
  assert.notEqual(replacement.member.capability, originalMember.member.capability);
  releaseRead();

  await assert.rejects(
    staleLeave,
    (error: unknown) => error instanceof CoordinationError && error.code === 'UNAUTHORIZED',
  );
  const currentRoom = repository.rooms.get(host.room.roomId);
  assert.ok(currentRoom);
  const activeReplacement = currentRoom.members.find(({ playerId }) => (
    playerId === replacement.member.playerId
  ));
  assert.ok(activeReplacement);
  assert.notEqual(activeReplacement.capabilityHash, originalVerifier);
});

test('keeps a deleted create request retired until its idempotency window expires', async () => {
  let now = 1_000;
  const { repository, service } = createHarness({ now: () => now });
  const request = { gameId: 'game-1', maxPlayers: 3, idempotencyKey: createIdempotencyKey() };
  const created = await service.createRoom(request);

  await service.leaveRoom({ roomId: created.room.roomId, capability: created.member.capability });
  await assert.rejects(
    service.createRoom(request),
    (error: unknown) => error instanceof CoordinationError && error.code === 'IDEMPOTENCY_KEY_RETIRED',
  );
  assert.equal(repository.rooms.size, 0);

  now += 24 * 60 * 60 * 1_000 + 1;
  const afterExpiry = await service.createRoom(request);

  assert.notEqual(afterExpiry.room.roomId, created.room.roomId);
  assert.equal(repository.rooms.size, 1);
});

test('rejects a client-supplied player identity claim during join', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);

  await assert.rejects(
    service.joinRoom({
      roomId: host.room.roomId, playerId: host.member.playerId, idempotencyKey: createIdempotencyKey(),
    }),
    (error: unknown) => error instanceof CoordinationError && error.code === 'INVALID_INPUT',
  );
  assert.deepEqual(repository.rooms.get(host.room.roomId)?.members.map(({ playerId }) => playerId), [
    host.member.playerId,
  ]);
});

test('removes the caller identified by capability and deletes the room only when its host leaves', async () => {
  const { repository, service } = createHarness();
  const host = await createRoom(service);
  const guest = await joinRoom(service, host.room.roomId);

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
  const guest = await joinRoom(service, host.room.roomId);
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
  const guest = await joinRoom(service, host.room.roomId);

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
  const firstGuest = await joinRoom(service, firstHost.room.roomId);
  const secondGuest = await joinRoom(service, firstHost.room.roomId);
  const secondHost = await createRoom(service);
  const otherRoomGuest = await joinRoom(service, secondHost.room.roomId);
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
