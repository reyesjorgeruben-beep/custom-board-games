import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

const roomListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_DISCOVERY_LIMIT).optional(),
});

const storedMemberSchema = z.strictObject({
  playerId: z.string().trim().min(1).max(256),
  capabilityHash: z.string().regex(/^[0-9a-f]{64}$/),
});

const storedRoomSchema = z.strictObject({
  summary: roomSummarySchema,
  members: z.array(storedMemberSchema).max(DEFAULT_MAX_ROOM_PLAYERS),
});

export interface StoredMember {
  readonly playerId: string;
  /** SHA-256 digest of the high-entropy bearer capability; never the raw capability. */
  readonly capabilityHash: string;
}

export interface StoredRoom {
  readonly summary: RoomSummary;
  readonly members: readonly StoredMember[];
}

export interface SignalQuery {
  readonly roomId: string;
  readonly recipientId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

/** Persistence-only operations; room records contain hashes, membership, and lobby metadata. */
export interface CoordinationRepository {
  loadRoom(roomId: string): Promise<unknown | undefined>;
  loadRooms(limit: number): Promise<readonly unknown[]>;
  saveRoom(room: StoredRoom): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
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
  const hasUniqueMembers = new Set(playerIds).size === playerIds.length;
  const hasUniqueCapabilities = new Set(capabilityHashes).size === capabilityHashes.length;
  const isConsistent = room.summary.playerCount === room.members.length
    && room.summary.playerCount <= room.summary.maxPlayers
    && playerIds.includes(room.summary.hostId);
  if (!hasUniqueMembers || !hasUniqueCapabilities || !isConsistent) {
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

  function createCapability(): string {
    const capability = randomBytes(32).toString('base64url');
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
      const roomId = createIdentifier('room');
      if (await repository.loadRoom(roomId) !== undefined) {
        throw new CoordinationError('ROOM_ID_COLLISION', 'The generated room identifier is already in use.');
      }

      const playerId = createIdentifier('host player');
      const capability = createCapability();
      const summary = roomSummarySchema.parse({
        roomId,
        gameId: request.gameId,
        hostId: playerId,
        playerCount: 1,
        maxPlayers: request.maxPlayers,
        status: 'open',
        version: 0,
      });
      const access = roomAccessSchema.parse({ room: summary, member: { playerId, capability } });
      await repository.saveRoom({
        summary,
        members: [{ playerId, capabilityHash: capabilityDigest(capability) }],
      });
      return access;
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
      const room = await requireRoom(request.roomId);
      if (room.summary.status !== 'open') {
        throw new CoordinationError('ROOM_NOT_OPEN', 'Only open rooms accept new members.');
      }
      if (room.members.length >= room.summary.maxPlayers) {
        throw new CoordinationError('ROOM_FULL', 'The room has reached its player limit.');
      }

      const playerId = createIdentifier('guest player');
      if (room.members.some((member) => member.playerId === playerId)) {
        throw new CoordinationError('PLAYER_ID_COLLISION', 'The generated player identifier is already in use.');
      }
      const capability = createCapability();
      const capabilityHash = capabilityDigest(capability);
      if (room.members.some((member) => digestMatches(member.capabilityHash, capabilityHash))) {
        throw new RangeError('The generated room capability is already in use.');
      }
      const members = [...room.members, { playerId, capabilityHash }];
      const summary = roomSummarySchema.parse({
        ...room.summary,
        playerCount: members.length,
        version: room.summary.version + 1,
      });
      const access = roomAccessSchema.parse({ room: summary, member: { playerId, capability } });
      await repository.saveRoom({ summary, members });
      return access;
    },

    async leaveRoom(input) {
      const request = parseInput(roomMemberRequestSchema, input);
      const room = await requireRoom(request.roomId);
      const caller = requireMember(room, request.capability);
      if (caller.playerId === room.summary.hostId) {
        await repository.deleteRoom(request.roomId);
        return undefined;
      }

      const members = room.members.filter((member) => member.playerId !== caller.playerId);
      const summary = roomSummarySchema.parse({
        ...room.summary,
        playerCount: members.length,
        version: room.summary.version + 1,
      });
      await repository.saveRoom({ summary, members });
      return summary;
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
