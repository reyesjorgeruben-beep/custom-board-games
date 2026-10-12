import { z } from 'zod';

export const visibilityAudienceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({ kind: z.literal('players'), playerIds: z.array(z.string().min(1)) }),
  z.strictObject({ kind: z.literal('team'), teamId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('host') }),
]);
export type VisibilityAudience = z.infer<typeof visibilityAudienceSchema>;

export type ViewerIdentity = {
  playerId: string;
  teamId?: string;
  isHost?: boolean;
};

export function isVisibleTo(audience: VisibilityAudience, viewer: ViewerIdentity): boolean {
  switch (audience.kind) {
    case 'public': return true;
    case 'players': return audience.playerIds.includes(viewer.playerId);
    case 'team': return viewer.teamId === audience.teamId;
    case 'host': return viewer.isHost === true;
  }
}
