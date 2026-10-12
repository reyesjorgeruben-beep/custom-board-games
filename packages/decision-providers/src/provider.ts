import type {
  DecisionKind,
  DecisionMap,
  DecisionRequestFor,
  DecisionSubmissionFor,
} from '@board-games/protocol';

/** Human and bot decision sources return the same game-defined response envelope. */
export interface DecisionProvider<M extends DecisionMap> {
  provide<K extends DecisionKind<M>>(
    request: DecisionRequestFor<M, K>,
  ): Promise<DecisionSubmissionFor<M, K>>;
}

/** Injected UI input capture receives only the actor's decision request and returns its response value. */
export interface HumanInputCapture<M extends DecisionMap> {
  <K extends DecisionKind<M>>(
    request: DecisionRequestFor<M, K>,
  ): M[K]['response'] | Promise<M[K]['response']>;
}

export type DecisionHandlerMap<M extends DecisionMap> = {
  [K in DecisionKind<M>]: (
    request: DecisionRequestFor<M, K>,
  ) => M[K]['response'] | Promise<M[K]['response']>;
};
