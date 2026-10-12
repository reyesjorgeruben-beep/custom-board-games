import {
  roomSummarySchema,
  signalMessageSchema,
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

const roomInputSchema = z.strictObject({
  gameId: z.string().trim().min(1).max(256),
  hostId: z.string().trim().min(1).max(256),
  maxPlayers: z.number().int().min(1).max(DEFAULT_MAX_ROOM_PLAYERS),
});

const memberInputSchema = z.strictObject({
  roomId: z.string().trim().min(1).max(256),
  playerId: z.string().trim().min(1).max(256),
});

const roomListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_DISCOVERY_LIMIT).optional(),
});

const receiveSignalsQuerySchema = z.strictObject({
  roomId: z.string().trim().min(1).max(256),
  recipientId: z.string().trim().min(1).max(256),
  afterSequence: z.number().int().min(-1).optional(),
  limit: z.number().int().min(1).max(MAX_SIGNAL_PAGE_LIMIT).optional(),
});

const storedRoomSchema = z.strictObject({
  summary: roomSummarySchema,
  memberIds: z.array(z.string().trim().min(1).max(256)).max(DEFAULT_MAX_ROOM_PLAYERS),
});

export interface StoredRoom {
  readonly summary: RoomSummary;
  readonly memberIds: readonly string[];
}

export interface SignalQuery {
  readonly roomId: string;
  readonly recipientId: string;
  readonly afterSequence: number;
  readonly limit: number;
}

/** Persistence-only operations; stored room records contain membership and lobby metadata only. */
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
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NOT_OPEN'
  | 'ROOM_FULL'
  | 'ROOM_ID_COLLISION'
  | 'NOT_A_MEMBER'
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
  readonly createId: () => string;
  readonly now: () => number;
  readonly maxSignalPayloadBytes?: number;
  readonly maxSignalLifetimeMs?: number;
}

export interface CoordinationService {
  createRoom(input: unknown): Promise<RoomSummary>;
  listRooms(query?: unknown): Promise<readonly RoomSummary[]>;
  joinRoom(input: unknown): Promise<RoomSummary>;
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
  const hasUniqueMembers = new Set(room.memberIds).size === room.memberIds.length;
  const isConsistent = room.summary.playerCount === room.memberIds.length
    && room.summary.playerCount <= room.summary.maxPlayers
    && room.memberIds.includes(room.summary.hostId);
  if (!hasUniqueMembers || !isConsistent) {
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

  async function requireRoom(roomId: string): Promise<StoredRoom> {
    const candidate = await repository.loadRoom(roomId);
    if (candidate === undefined) {
      throw new CoordinationError('ROOM_NOT_FOUND', 'The requested room does not exist.');
    }
    return parseStoredRoom(candidate);
  }

  return {
    async createRoom(input) {
      const request = parseInput(roomInputSchema, input);
      const roomId = options.createId();
      if (!roomId.trim() || roomId.length > 256) invalidInput();
      const existing = await repository.loadRoom(roomId);
      if (existing !== undefined) {
        throw new CoordinationError('ROOM_ID_COLLISION', 'The generated room identifier is already in use.');
      }

      const summary = roomSummarySchema.parse({
        roomId,
        gameId: request.gameId,
        hostId: request.hostId,
        playerCount: 1,
        maxPlayers: request.maxPlayers,
        status: 'open',
        version: 0,
      });
      await repository.saveRoom({ summary, memberIds: [request.hostId] });
      return summary;
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
      const request = parseInput(memberInputSchema, input);
      const room = await requireRoom(request.roomId);
      if (room.memberIds.includes(request.playerId)) return room.summary;
      if (room.summary.status !== 'open') {
        throw new CoordinationError('ROOM_NOT_OPEN', 'Only open rooms accept new members.');
      }
      if (room.memberIds.length >= room.summary.maxPlayers) {
        throw new CoordinationError('ROOM_FULL', 'The room has reached its player limit.');
      }

      const memberIds = [...room.memberIds, request.playerId];
      const summary = roomSummarySchema.parse({
        ...room.summary,
        playerCount: memberIds.length,
        version: room.summary.version + 1,
      });
      await repository.saveRoom({ summary, memberIds });
      return summary;
    },

    async leaveRoom(input) {
      const request = parseInput(memberInputSchema, input);
      const room = await requireRoom(request.roomId);
      if (!room.memberIds.includes(request.playerId)) {
        throw new CoordinationError('NOT_A_MEMBER', 'The player is not a member of this room.');
      }
      if (request.playerId === room.summary.hostId) {
        await repository.deleteRoom(request.roomId);
        return undefined;
      }

      const memberIds = room.memberIds.filter((memberId) => memberId !== request.playerId);
      const summary = roomSummarySchema.parse({
        ...room.summary,
        playerCount: memberIds.length,
        version: room.summary.version + 1,
      });
      await repository.saveRoom({ summary, memberIds });
      return summary;
    },

    async sendSignal(input) {
      const message = parseInput(signalMessageSchema, input);
      const now = options.now();
      if (message.expiresAt <= now) {
        throw new CoordinationError('SIGNAL_EXPIRED', 'The signaling message has expired.');
      }
      if (message.expiresAt > now + maxSignalLifetimeMs) {
        throw new CoordinationError('SIGNAL_LIFETIME_EXCEEDED', 'The signaling message lifetime is too long.');
      }
      if (payloadSize(message.payload) > maxSignalPayloadBytes) {
        throw new CoordinationError('SIGNAL_TOO_LARGE', 'The signaling payload exceeds the size limit.');
      }

      const room = await requireRoom(message.roomId);
      if (
        room.summary.status === 'closed'
        || message.senderId === message.recipientId
        || !room.memberIds.includes(message.senderId)
        || !room.memberIds.includes(message.recipientId)
      ) {
        throw new CoordinationError('INVALID_SIGNAL_TARGET', 'Both signaling peers must be distinct room members.');
      }

      await repository.storeSignal(message);
      return message;
    },

    async receiveSignals(query) {
      const request = parseInput(receiveSignalsQuerySchema, query);
      const afterSequence = request.afterSequence ?? -1;
      const limit = request.limit ?? DEFAULT_SIGNAL_PAGE_LIMIT;
      const room = await requireRoom(request.roomId);
      if (!room.memberIds.includes(request.recipientId)) {
        throw new CoordinationError('NOT_A_MEMBER', 'The recipient is not a member of this room.');
      }

      const now = options.now();
      const candidates = await repository.loadSignals({
        roomId: request.roomId,
        recipientId: request.recipientId,
        afterSequence,
        limit,
      });

      return candidates
        .map(parseStoredSignal)
        .filter((message) => (
          message.roomId === request.roomId
          && message.recipientId === request.recipientId
          && message.sequence > afterSequence
          && message.expiresAt > now
          && message.expiresAt <= now + maxSignalLifetimeMs
          && payloadSize(message.payload) <= maxSignalPayloadBytes
          && room.memberIds.includes(message.senderId)
        ))
        .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
        .slice(0, limit);
    },
  };
}

export type { RoomSummary, SignalMessage } from '@board-games/protocol';
