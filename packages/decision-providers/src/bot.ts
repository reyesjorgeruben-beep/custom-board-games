import type {
  DecisionKind,
  DecisionMap,
  DecisionRequestFor,
  DecisionSubmissionFor,
} from '@board-games/protocol';
import type { DecisionHandlerMap, DecisionProvider } from './provider.ts';

/** Routes each request to a handler keyed by its game-defined kind. */
export function createBotDecisionProvider<M extends DecisionMap>(
  handlers: DecisionHandlerMap<M>,
): DecisionProvider<M> {
  return {
    async provide<K extends DecisionKind<M>>(
      request: DecisionRequestFor<M, K>,
    ): Promise<DecisionSubmissionFor<M, K>> {
      const handler = handlers[request.kind] as (
        request: DecisionRequestFor<M, K>,
      ) => M[K]['response'] | Promise<M[K]['response']>;
      const response = await handler(request);
      return {
        decisionId: request.id,
        kind: request.kind,
        actorId: request.actorId,
        stateVersion: request.stateVersion,
        response,
      };
    },
  };
}
