import type {
  DecisionKind,
  DecisionMap,
  DecisionRequestFor,
  DecisionSubmissionFor,
} from '@board-games/protocol';

/** Public, game-independent metadata needed to register and configure a game. */
export type GameMetadata = {
  id: string;
  version: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
};

/** The stable identity the engine needs for turn ownership and projections. */
export type GamePlayer = {
  id: string;
};

export type DecisionValidation =
  | { valid: true }
  | { valid: false; reason: string };

/** A validated response paired with the request that caused it. */
export type DecisionResolution<
  M extends DecisionMap,
  K extends DecisionKind<M>,
> = {
  request: DecisionRequestFor<M, K>;
  submission: DecisionSubmissionFor<M, K>;
};

/** Game-owned context creation, response validation, and state transition for one decision kind. */
export type DecisionStrategy<
  State,
  M extends DecisionMap,
  K extends DecisionKind<M>,
> = {
  createContext(state: Readonly<State>, actorId: string): M[K]['context'];
  validateResponse(
    state: Readonly<State>,
    request: DecisionRequestFor<M, K>,
    response: M[K]['response'],
  ): DecisionValidation;
  apply(state: Readonly<State>, resolutions: readonly DecisionResolution<M, K>[]): State;
};

export type DecisionStrategies<State, M extends DecisionMap> = {
  [K in DecisionKind<M>]: DecisionStrategy<State, M, K>;
};

/** One step from a game's flow policy; all actor responses form a barrier. */
export type TurnDecision<M extends DecisionMap> = {
  [K in DecisionKind<M>]: {
    kind: K;
    actorIds: readonly string[];
  };
}[DecisionKind<M>];

export type TurnPolicy<State, M extends DecisionMap> = {
  /** Return null when the game is complete. */
  next(state: Readonly<State>): TurnDecision<M> | null;
};

/** Composed game rules and projection contract consumed by the platform engine. */
export type GameDefinition<
  State,
  M extends DecisionMap,
  Setup,
  View,
> = {
  metadata: GameMetadata;
  setup(configuration: Setup, players: readonly GamePlayer[]): State;
  strategies: DecisionStrategies<State, M>;
  turnPolicy: TurnPolicy<State, M>;
  project(state: Readonly<State>, viewerId: string): View;
};
