import { z } from 'zod';
import type { DecisionMap, DecisionRequest } from './decision.ts';

export type PlayerSnapshot<M extends DecisionMap, V> = {
  tableId: string;
  viewerId: string;
  stateVersion: number;
  view: V;
  pending: DecisionRequest<M>[];
};

export const playerSnapshotEnvelopeSchema = z.strictObject({
  tableId: z.string().min(1),
  viewerId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  view: z.unknown(),
  pending: z.array(z.unknown()),
});

export function createSnapshotProtocol<M extends DecisionMap, V>(
  decisions: { parseRequest(input: unknown): DecisionRequest<M> },
  viewSchema: z.ZodType<V>,
) {
  return {
    parse(input: unknown): PlayerSnapshot<M, V> {
      const envelope = playerSnapshotEnvelopeSchema.parse(input);
      const view = viewSchema.parse(envelope.view);
      const pending = envelope.pending.map((item) => {
        const request = decisions.parseRequest(item);
        if (request.actorId !== envelope.viewerId ||
            request.tableId !== envelope.tableId ||
            request.stateVersion !== envelope.stateVersion) {
          throw new Error('Pending decision does not belong to this snapshot');
        }
        return request;
      });
      return { ...envelope, view, pending };
    },
  };
}
