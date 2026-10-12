import type {
  DecisionKind,
  DecisionMap,
  DecisionRequestFor,
  DecisionSubmissionFor,
} from '@board-games/protocol';
import type { DecisionProvider, HumanInputCapture } from './provider.ts';

/** Adapts injected human input capture to the shared decision submission contract. */
export function createHumanDecisionProvider<M extends DecisionMap>(
  capture: HumanInputCapture<M>,
): DecisionProvider<M> {
  return {
    async provide<K extends DecisionKind<M>>(
      request: DecisionRequestFor<M, K>,
    ): Promise<DecisionSubmissionFor<M, K>> {
      const response = await capture(request);
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
