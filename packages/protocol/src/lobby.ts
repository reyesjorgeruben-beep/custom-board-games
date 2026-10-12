import { z } from 'zod';

const boundedIdSchema = z.string().trim().min(1).max(256);

export const roomSummarySchema = z.strictObject({
  roomId: z.string().min(1),
  gameId: z.string().min(1),
  hostId: z.string().min(1),
  playerCount: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  status: z.enum(['open', 'playing', 'closed']),
  version: z.number().int().nonnegative(),
}).refine((room) => room.playerCount <= room.maxPlayers, {
  message: 'Player count exceeds room capacity',
  path: ['playerCount'],
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

/** A bearer credential issued once for one server-assigned room member. */
export const roomMemberSchema = z.strictObject({
  playerId: boundedIdSchema,
  capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type RoomMember = z.infer<typeof roomMemberSchema>;

/** Returned by room creation and a successful join; keep the capability private. */
export const roomAccessSchema = z.strictObject({
  room: roomSummarySchema,
  member: roomMemberSchema,
});
export type RoomAccess = z.infer<typeof roomAccessSchema>;

/** Room identities are server-assigned; clients provide only public room settings. */
export const createRoomRequestSchema = z.strictObject({
  gameId: boundedIdSchema,
  maxPlayers: z.number().int().min(1).max(64),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

/** Joining creates a new server-assigned member and returns its capability once. */
export const joinRoomRequestSchema = z.strictObject({
  roomId: boundedIdSchema,
});
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

/** Authenticated mutation/poll requests identify the caller by capability only. */
export const roomMemberRequestSchema = z.strictObject({
  roomId: boundedIdSchema,
  capability: roomMemberSchema.shape.capability,
});
export type RoomMemberRequest = z.infer<typeof roomMemberRequestSchema>;

/** Sender identity is derived by the service from capability, never supplied here. */
export const sendSignalRequestSchema = z.strictObject({
  roomId: boundedIdSchema,
  capability: roomMemberSchema.shape.capability,
  recipientId: boundedIdSchema,
  kind: z.enum(['offer', 'answer', 'ice-candidate']),
  payload: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type SendSignalRequest = z.infer<typeof sendSignalRequestSchema>;

/** Recipient identity is derived by the service from capability. */
export const receiveSignalsRequestSchema = z.strictObject({
  roomId: boundedIdSchema,
  capability: roomMemberSchema.shape.capability,
  afterSequence: z.number().int().min(-1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type ReceiveSignalsRequest = z.infer<typeof receiveSignalsRequestSchema>;

export const signalMessageSchema = z.strictObject({
  id: z.string().min(1),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  kind: z.enum(['offer', 'answer', 'ice-candidate']),
  payload: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export type SignalMessage = z.infer<typeof signalMessageSchema>;
