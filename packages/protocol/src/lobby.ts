import { z } from 'zod';

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
