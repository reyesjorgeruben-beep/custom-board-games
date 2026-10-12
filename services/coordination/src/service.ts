import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  receiveSignalsRequestSchema,
  roomAccessSchema,
  roomMemberRequestSchema,
  roomMemberSchema,
  roomSummarySchema,
  sendSignalRequestSchema,
  signalMessageSchema,
  type RoomAccess,
  type RoomMember,
  type RoomSummary,
  type SignalMessage,
} from '@board-games/protocol';
import { z } from 'zod';

const DEFAULT_DISCOVERY_LIMIT = 50;
const MAX_DISCOVERY_LIMIT = 100;
const DEFAULT_SIGNAL_PAGE_LIMIT = 50;
const MAX_SIGNAL_PAGE_LIMIT = 50;
const DEFAULT_MAX_SIGNAL_PAYLOAD_BYTES = 16 * 1024;
const DEFAULT_MAX_SIGNAL_LIFETIME_MS = 2 * 60 * 1_000;
const DEFAULT_MAX_ROOM_PLAYERS = 64;
const CREATE_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const MAX_RETAINED_JOIN_REQUESTS_PER_ROOM = 256;

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

const roomListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_DISCOVERY_LIMIT).optional(),
});

const storedMemberSchema = z.strictObject({
  playerId: z.string().trim().min(1).max(256),
  capabilityHash: hashSchema,
  joinRequestHash: hashSchema.optional(),
});

const storedRoomSchema = z.strictObject({
  summary: roomSummarySchema,
  members: z.array(storedMemberSchema).max(DEFAULT_MAX_ROOM_PLAYERS),
  createRequestHash: hashSchema,
  createRequestFingerprint: hashSchema,
  createRequestExpiresAt: z.number().int().nonnegative(),
  retiredJoinRequestHashes: z.array(hashSchema).max(MAX_RETAINED_JOIN_REQUESTS_PER_ROOM),
});

export interface StoredMember {
  readonly playerId: string;
  /** SHA-256 digest of the high-entropy bearer capability; never the raw capability. */
  readonly capabilityHash: string;
  /** Room-scoped digest of a private join retry key; omitted for the host member. */
  readonly joinRequestHash?: string | undefined;
}

export interface StoredRoom {
  readonly summary: RoomSummary;
  readonly members: readonly StoredMember[];
  /** Digest of the private create retry key; the raw key is never persisted. */
  readonly createRequestHash: string;
  readonly createRequestFingerprint: string;
  readonly createRequestExpiresAt: number;
  /** Retired join-key digests prevent delayed retries from enrolling a second member. */
  readonly retiredJoinRequestHashes: readonly string[];
}

export type CreateRoomCommit =
  | { readonly outcome: 'created'; readonly room: unknown }
  | { readonly outcome: 'replayed'; readonly room: unknown }
  | { readonly outcome: 'retired' }
  | { readonly outcome: 'room-id-collision' }
  | { readonly outcome: 'idempotency-key-reused' };

export type JoinRoomCommit =
  | { readonly outcome: 'joined'; readonly room: unknown }
  | { readonly outcome: 'replayed'; readonly room: unknown }
  | { readonly outcome: 'retired' }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'not-open' }
  | { readonly outcome: 'full' }
  | { readonly outcome: 'history-full' }
  | { readonly outcome: 'player-id-collision' }
  | { readonly outcome: 'capability-collision' };

export type LeaveMemberCommit =
  | { readonly outcome: 'left'; readonly room: unknown }
  | { readonly outcome: 'room-deleted' }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'member-not-found' };

export interface SignalQuery {
  readonly roomId: string;
  readonly recipientId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

/** Persistence operations; conditional room mutations must commit atomically in each adapter. */
export interface CoordinationRepository {
  loadRoom(roomId: string): Promise<unknown | undefined>;
  loadRooms(limit: number): Promise<readonly unknown[]>;
  /** Claims the room ID and create-key digest together, or replays that key's unexpired result. */
  createRoomIfAbsent(room: StoredRoom, now: number): Promise<CreateRoomCommit>;
  /** Checks replay, retirement, room state, capacity, and member uniqueness before one append. */
  joinRoomIfOpen(roomId: string, member: StoredMember): Promise<JoinRoomCommit>;
  /** Removes only this authenticated member; host leave atomically deletes the room and retires its create key. */
  leaveMember(
    roomId: string,
    playerId: string,
    authenticatedCapabilityHash: string,
    now: number,
  ): Promise<LeaveMemberCommit>;
  storeSignal(message: SignalMessage): Promise<void>;
  loadSignals(query: SignalQuery): Promise<readonly unknown[]>;
}

export type CoordinationErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NOT_OPEN'
  | 'ROOM_FULL'
  | 'ROOM_ID_COLLISION'
  | 'PLAYER_ID_COLLISION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_KEY_RETIRED'
  | 'IDEMPOTENCY_HISTORY_FULL'
  | 'INVALID_SIGNAL_TARGET'
  | 'SIGNAL_EXPIRED'
  | 'SIGNAL_LIFETIME_EXCEEDED'
  | 'SIGNAL_TOO_LARGE'
  | 'INVALID_STORED_ROOM'
  | 'INVALID_STORED_SIGNAL';

export class CoordinationError extends Error {
  constructor(readonly code: CoordinationErrorCode, message: string) {
    super(message);
    this.name = 'CoordinationError';
  }
}

export interface CoordinationServiceOptions {
  /** Generates non-secret room, member, and signal identifiers. */
  readonly createId: () => string;
  readonly now: () => number;
  /** Stable deployment secret used to derive retry-recoverable capabilities. Keep outside persisted records. */
  readonly capabilityDerivationKey: Uint8Array;
  readonly maxSignalPayloadBytes?: number;
  readonly maxSignalLifetimeMs?: number;
}

export interface CoordinationService {
  createRoom(input: unknown): Promise<RoomAccess>;
  listRooms(query?: unknown): Promise<readonly RoomSummary[]>;
  joinRoom(input: unknown): Promise<RoomAccess>;
  leaveRoom(input: unknown): Promise<RoomSummary | undefined>;
  sendSignal(input: unknown): Promise<SignalMessage>;
  receiveSignals(query: unknown): Promise<readonly SignalMessage[]>;
}

function invalidInput(): never {
  throw new CoordinationError('INVALID_INPUT', 'The coordination request is invalid.');
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return invalidInput();
  return result.data;
}

function parseStoredRoom(input: unknown): StoredRoom {
  const result = storedRoomSchema.safeParse(input);
  if (!result.success) {
    throw new CoordinationError('INVALID_STORED_ROOM', 'The stored room record is invalid.');
  }

  const room = result.data;
  const playerIds = room.members.map(({ playerId }) => playerId);
  const capabilityHashes = room.members.map(({ capabilityHash }) => capabilityHash);
  const joinRequestHashes = room.members.flatMap(({ joinRequestHash }) => (
    joinRequestHash === undefined ? [] : [joinRequestHash]
  ));
  const retiredJoinRequestHashes = room.retiredJoinRequestHashes;
  const hasUniqueMembers = new Set(playerIds).size === playerIds.length;
  const hasUniqueCapabilities = new Set(capabilityHashes).size === capabilityHashes.length;
  const allJoinRequestHashes = [...joinRequestHashes, ...retiredJoinRequestHashes];
  const hasUniqueJoinRequests = new Set(allJoinRequestHashes).size === allJoinRequestHashes.length;
  const isConsistent = room.summary.playerCount === room.members.length
    && room.summary.playerCount <= room.summary.maxPlayers
    && playerIds.includes(room.summary.hostId)
    && allJoinRequestHashes.length <= MAX_RETAINED_JOIN_REQUESTS_PER_ROOM;
  if (!hasUniqueMembers || !hasUniqueCapabilities || !hasUniqueJoinRequests || !isConsistent) {
    throw new CoordinationError('INVALID_STORED_ROOM', 'The stored room membership is inconsistent.');
  }

  return room;
}

function parseStoredSignal(input: unknown): SignalMessage {
  const result = signalMessageSchema.safeParse(input);
  if (!result.success) {
    throw new CoordinationError('INVALID_STORED_SIGNAL', 'The stored signaling record is invalid.');
  }
  return result.data;
}

function payloadSize(payload: string): number {
  return new TextEncoder().encode(payload).byteLength;
}

function capabilityDigest(capability: string): string {
  return createHash('sha256').update(capability).digest('hex');
}

function digestFields(domain: string, fields: readonly string[]): string {
  const digest = createHash('sha256').update(domain);
  for (const field of fields) {
    const bytes = Buffer.from(field, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    digest.update(length).update(bytes);
  }
  return digest.digest('hex');
}

function createRequestDigest(idempotencyKey: string): string {
  return digestFields('custom-board-games/coordination/create-idempotency/v1', [idempotencyKey]);
}

function createRequestFingerprint(gameId: string, maxPlayers: number): string {
  return createHash('sha256')
    .update('custom-board-games/coordination/create-payload/v1\0')
    .update(JSON.stringify([gameId, maxPlayers]))
    .digest('hex');
}

function joinRequestDigest(roomId: string, idempotencyKey: string): string {
  return digestFields('custom-board-games/coordination/join-idempotency/v1', [roomId, idempotencyKey]);
}

function digestMatches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createCoordinationService(
  repository: CoordinationRepository,
  options: CoordinationServiceOptions,
): CoordinationService {
  const maxSignalPayloadBytes = options.maxSignalPayloadBytes ?? DEFAULT_MAX_SIGNAL_PAYLOAD_BYTES;
  const maxSignalLifetimeMs = options.maxSignalLifetimeMs ?? DEFAULT_MAX_SIGNAL_LIFETIME_MS;
  if (!Number.isSafeInteger(maxSignalPayloadBytes) || maxSignalPayloadBytes < 1) {
    throw new RangeError('maxSignalPayloadBytes must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(maxSignalLifetimeMs) || maxSignalLifetimeMs < 1) {
    throw new RangeError('maxSignalLifetimeMs must be a positive safe integer.');
  }
  if (!(options.capabilityDerivationKey instanceof Uint8Array) || options.capabilityDerivationKey.byteLength < 32) {
    throw new RangeError('capabilityDerivationKey must contain at least 32 bytes.');
  }
  const capabilityDerivationKey = Buffer.from(options.capabilityDerivationKey);

  function createIdentifier(purpose: string): string {
    const id = options.createId();
    if (typeof id !== 'string') {
      throw new RangeError(`The generated ${purpose} identifier is invalid.`);
    }
    const normalized = id.trim();
    if (!normalized || normalized.length > 256) {
      throw new RangeError(`The generated ${purpose} identifier is invalid.`);
    }
    return normalized;
  }

  function deriveCapability(
    operation: 'create' | 'join',
    idempotencyKey: string,
    roomId: string,
    playerId: string,
  ): string {
    const mac = createHmac('sha256', capabilityDerivationKey)
      .update('custom-board-games/coordination/member-capability/v1');
    for (const field of [operation, idempotencyKey, roomId, playerId]) {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      mac.update(length).update(bytes);
    }
    const capability = mac.digest('base64url');
    const result = roomMemberSchema.shape.capability.safeParse(capability);
    if (!result.success) {
      throw new RangeError('The generated room capability is invalid.');
    }
    return result.data;
  }

  function requireMember(room: StoredRoom, capability: string): StoredMember {
    const digest = capabilityDigest(capability);
    let caller: StoredMember | undefined;
    for (const member of room.members) {
      if (digestMatches(member.capabilityHash, digest)) caller = member;
    }
    if (caller === undefined) {
      throw new CoordinationError('UNAUTHORIZED', 'The caller is not authorized for this room.');
    }
    return caller;
  }

  async function requireRoom(roomId: string): Promise<StoredRoom> {
    const candidate = await repository.loadRoom(roomId);
    if (candidate === undefined) {
      throw new CoordinationError('ROOM_NOT_FOUND', 'The requested room does not exist.');
    }
    return parseStoredRoom(candidate);
  }

  return {
    async createRoom(input) {
      const request = parseInput(createRoomRequestSchema, input);
      const now = options.now();
      const expiresAt = now + CREATE_IDEMPOTENCY_WINDOW_MS;
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(expiresAt)) {
        throw new RangeError('The coordination clock must return a nonnegative safe integer.');
      }

      const roomId = createIdentifier('room');
      const playerId = createIdentifier('host player');
      const capability = deriveCapability('create', request.idempotencyKey, roomId, playerId);
      const createRequestHash = createRequestDigest(request.idempotencyKey);
      const createFingerprint = createRequestFingerprint(request.gameId, request.maxPlayers);
      const summary = roomSummarySchema.parse({
        roomId,
        gameId: request.gameId,
        hostId: playerId,
        playerCount: 1,
        maxPlayers: request.maxPlayers,
        status: 'open',
        version: 0,
      });
      const candidate: StoredRoom = {
        summary,
        members: [{ playerId, capabilityHash: capabilityDigest(capability) }],
        createRequestHash,
        createRequestFingerprint: createFingerprint,
        createRequestExpiresAt: expiresAt,
        retiredJoinRequestHashes: [],
      };
      const result = await repository.createRoomIfAbsent(candidate, now);
      if (result.outcome === 'room-id-collision') {
        throw new CoordinationError('ROOM_ID_COLLISION', 'The generated room identifier is already in use.');
      }
      if (result.outcome === 'idempotency-key-reused') {
        throw new CoordinationError('IDEMPOTENCY_KEY_REUSED', 'The create key was already used with different settings.');
      }
      if (result.outcome === 'retired') {
        throw new CoordinationError('IDEMPOTENCY_KEY_RETIRED', 'The create request has already been retired.');
      }

      const room = parseStoredRoom(result.room);
      if (room.createRequestHash !== createRequestHash || room.createRequestFingerprint !== createFingerprint) {
        throw new CoordinationError('INVALID_STORED_ROOM', 'The stored create request does not match its idempotency key.');
      }
      const accessCapability = deriveCapability(
        'create', request.idempotencyKey, room.summary.roomId, room.summary.hostId,
      );
      const hostMember = room.members.find(({ playerId: id }) => id === room.summary.hostId);
      if (hostMember === undefined || !digestMatches(hostMember.capabilityHash, capabilityDigest(accessCapability))) {
        throw new CoordinationError('INVALID_STORED_ROOM', 'The stored host credential does not match its create key.');
      }
      return roomAccessSchema.parse({
        room: room.summary,
        member: { playerId: room.summary.hostId, capability: accessCapability },
      });
    },

    async listRooms(query = {}) {
      const request = parseInput(roomListQuerySchema, query);
      const limit = request.limit ?? DEFAULT_DISCOVERY_LIMIT;
      const rooms = await repository.loadRooms(limit);
      return rooms
        .map(parseStoredRoom)
        .filter((room) => room.summary.status === 'open')
        .slice(0, limit)
        .map((room) => room.summary);
    },

    async joinRoom(input) {
      const request = parseInput(joinRoomRequestSchema, input);
      const playerId = createIdentifier('guest player');
      const capability = deriveCapability('join', request.idempotencyKey, request.roomId, playerId);
      const requestHash = joinRequestDigest(request.roomId, request.idempotencyKey);
      const capabilityHash = capabilityDigest(capability);
      const result = await repository.joinRoomIfOpen(request.roomId, {
        playerId,
        capabilityHash,
        joinRequestHash: requestHash,
      });
      if (result.outcome === 'not-found') {
        throw new CoordinationError('ROOM_NOT_FOUND', 'The requested room does not exist.');
      }
      if (result.outcome === 'not-open') {
        throw new CoordinationError('ROOM_NOT_OPEN', 'Only open rooms accept new members.');
      }
      if (result.outcome === 'full') {
        throw new CoordinationError('ROOM_FULL', 'The room has reached its player limit.');
      }
      if (result.outcome === 'history-full') {
        throw new CoordinationError('IDEMPOTENCY_HISTORY_FULL', 'The room has reached its join retry history limit.');
      }
      if (result.outcome === 'player-id-collision') {
        throw new CoordinationError('PLAYER_ID_COLLISION', 'The generated player identifier is already in use.');
      }
      if (result.outcome === 'capability-collision') {
        throw new RangeError('The generated room capability is already in use.');
      }
      if (result.outcome === 'retired') {
        throw new CoordinationError('IDEMPOTENCY_KEY_RETIRED', 'The join request has already been retired.');
      }

      const room = parseStoredRoom(result.room);
      const member = room.members.find(({ joinRequestHash }) => joinRequestHash === requestHash);
      if (member === undefined) {
        throw new CoordinationError('INVALID_STORED_ROOM', 'The committed join has no matching member record.');
      }
      const accessCapability = deriveCapability('join', request.idempotencyKey, request.roomId, member.playerId);
      if (!digestMatches(member.capabilityHash, capabilityDigest(accessCapability))) {
        throw new CoordinationError('INVALID_STORED_ROOM', 'The stored member credential does not match its join key.');
      }
      return roomAccessSchema.parse({
        room: room.summary,
        member: { playerId: member.playerId, capability: accessCapability },
      });
    },

    async leaveRoom(input) {
      const request = parseInput(roomMemberRequestSchema, input);
      const room = await requireRoom(request.roomId);
      const caller = requireMember(room, request.capability);
      const now = options.now();
      if (!Number.isSafeInteger(now) || now < 0) {
        throw new RangeError('The coordination clock must return a nonnegative safe integer.');
      }
      const result = await repository.leaveMember(
        request.roomId, caller.playerId, caller.capabilityHash, now,
      );
      if (result.outcome === 'room-deleted') {
        return undefined;
      }
      if (result.outcome === 'not-found') {
        throw new CoordinationError('ROOM_NOT_FOUND', 'The requested room does not exist.');
      }
      if (result.outcome === 'member-not-found') {
        throw new CoordinationError('UNAUTHORIZED', 'The caller is not an active room member.');
      }
      return parseStoredRoom(result.room).summary;
    },

    async sendSignal(input) {
      const request = parseInput(sendSignalRequestSchema, input);
      const now = options.now();
      if (request.expiresAt <= now) {
        throw new CoordinationError('SIGNAL_EXPIRED', 'The signaling message has expired.');
      }
      if (request.expiresAt > now + maxSignalLifetimeMs) {
        throw new CoordinationError('SIGNAL_LIFETIME_EXCEEDED', 'The signaling message lifetime is too long.');
      }
      if (payloadSize(request.payload) > maxSignalPayloadBytes) {
        throw new CoordinationError('SIGNAL_TOO_LARGE', 'The signaling payload exceeds the size limit.');
      }

      const room = await requireRoom(request.roomId);
      const caller = requireMember(room, request.capability);
      if (
        room.summary.status === 'closed'
        || caller.playerId === request.recipientId
        || !room.members.some((member) => member.playerId === request.recipientId)
      ) {
        throw new CoordinationError('INVALID_SIGNAL_TARGET', 'Both signaling peers must be distinct room members.');
      }

      const message = signalMessageSchema.parse({
        id: createIdentifier('signal'),
        roomId: request.roomId,
        senderId: caller.playerId,
        recipientId: request.recipientId,
        kind: request.kind,
        payload: request.payload,
        sequence: request.sequence,
        expiresAt: request.expiresAt,
      });
      await repository.storeSignal(message);
      return message;
    },

    async receiveSignals(query) {
      const request = parseInput(receiveSignalsRequestSchema, query);
      const afterSequence = request.afterSequence ?? -1;
      const limit = request.limit ?? DEFAULT_SIGNAL_PAGE_LIMIT;
      const room = await requireRoom(request.roomId);
      const caller = requireMember(room, request.capability);
      const now = options.now();
      const candidates = await repository.loadSignals({
        roomId: request.roomId,
        recipientId: caller.playerId,
        afterSequence,
        limit,
      });

      return candidates
        .map(parseStoredSignal)
        .filter((message) => (
          message.roomId === request.roomId
          && message.recipientId === caller.playerId
          && message.sequence > afterSequence
          && message.expiresAt > now
          && message.expiresAt <= now + maxSignalLifetimeMs
          && payloadSize(message.payload) <= maxSignalPayloadBytes
          && room.members.some((member) => member.playerId === message.senderId)
        ))
        .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
        .slice(0, limit);
    },
  };
}

export type { RoomAccess, RoomMember, RoomSummary, SignalMessage } from '@board-games/protocol';
