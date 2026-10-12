import type {
  DecisionKind,
  DecisionMap,
  DecisionRequest,
  DecisionRequestFor,
  DecisionSubmission,
  DecisionSubmissionFor,
} from '../../protocol/src/decision.ts';
import type { PlayerSnapshot } from '../../protocol/src/snapshot.ts';
import type {
  DecisionResolution,
  DecisionStrategy,
  GameDefinition,
  GamePlayer,
  TurnDecision,
} from '../../game-sdk/src/index.ts';

type DecisionParser<M extends DecisionMap> = {
  parseRequest(input: unknown): DecisionRequest<M>;
  parseSubmission(input: unknown): DecisionSubmission<M>;
};

type SnapshotParser<M extends DecisionMap, View> = {
  parse(input: unknown): PlayerSnapshot<M, View>;
};

export type GameEngineOptions<State, M extends DecisionMap, Setup, View> = {
  tableId: string;
  game: GameDefinition<State, M, Setup, View>;
  setup: Setup;
  players: readonly GamePlayer[];
  decisions: DecisionParser<M>;
  snapshots: SnapshotParser<M, View>;
  /** Receives a one-based sequence for each request created by this table. */
  createDecisionId?: (tableId: string, sequence: number) => string;
};

export type SubmissionResult =
  | { status: 'waiting'; received: number; required: number }
  | { status: 'resolved'; stateVersion: number };

type ActiveDecisionGroup<M extends DecisionMap> = {
  kind: DecisionKind<M>;
  requests: DecisionRequest<M>[];
  submissions: Map<string, DecisionSubmission<M>>;
};

/** Coordinates decision IDs, actor barriers, runtime validation, versions, and projections. */
export class GameEngine<State, M extends DecisionMap, Setup, View> {
  private state: State;
  private version = 0;
  private sequence = 0;
  private activeGroup: ActiveDecisionGroup<M> | null = null;
  private pendingRequests: DecisionRequest<M>[] = [];
  private readonly playersById: Map<string, GamePlayer>;
  private readonly issuedDecisionIds = new Set<string>();

  constructor(private readonly options: GameEngineOptions<State, M, Setup, View>) {
    if (!options.tableId.trim()) throw new Error('Table ID must not be empty');
    this.playersById = new Map();
    for (const player of options.players) {
      if (!player.id.trim()) throw new Error('Player ID must not be empty');
      if (this.playersById.has(player.id)) throw new Error(`Duplicate player ID: ${player.id}`);
      this.playersById.set(player.id, player);
    }

    const { minPlayers, maxPlayers } = options.game.metadata;
    if (options.players.length < minPlayers || options.players.length > maxPlayers) {
      throw new Error(`Player count must be between ${minPlayers} and ${maxPlayers}`);
    }

    this.state = options.game.setup(options.setup, [...options.players]);
    this.advance();
  }

  get stateVersion(): number {
    return this.version;
  }

  /** Returns the host-authoritative state for trusted runtime orchestration. */
  get authoritativeState(): Readonly<State> {
    return this.state;
  }

  /** Builds and validates a snapshot containing only this viewer's projection and requests. */
  snapshotFor(viewerId: string): PlayerSnapshot<M, View> {
    if (!this.playersById.has(viewerId)) throw new Error(`Unknown player: ${viewerId}`);
    return this.options.snapshots.parse({
      tableId: this.options.tableId,
      viewerId,
      stateVersion: this.version,
      view: this.options.game.project(this.state, viewerId),
      pending: this.pendingRequests.filter((request) => request.actorId === viewerId),
    });
  }

  /** Parses an untrusted response, validates its correlation and legality, then joins its barrier. */
  submit(input: unknown): SubmissionResult {
    const submission = this.options.decisions.parseSubmission(input);
    const group = this.activeGroup;
    if (group === null) throw new Error('There is no active decision');
    if (submission.kind !== group.kind) throw new Error('Submission decision kind does not match the active decision');

    const request = group.requests.find((candidate) => candidate.actorId === submission.actorId);
    if (request === undefined || request.id !== submission.decisionId) {
      throw new Error('Submission does not match a pending request for this actor');
    }
    if (submission.stateVersion !== this.version || submission.stateVersion !== request.stateVersion) {
      throw new Error('Submission has a stale state version');
    }
    if (group.submissions.has(submission.actorId)) throw new Error('Actor already submitted a response');

    const strategy = this.options.game.strategies[group.kind] as unknown as DecisionStrategy<
      State,
      M,
      DecisionKind<M>
    >;
    const typedRequest = request as DecisionRequestFor<M, DecisionKind<M>>;
    const typedSubmission = submission as DecisionSubmissionFor<M, DecisionKind<M>>;
    const validation = strategy.validateResponse(this.state, typedRequest, typedSubmission.response);
    if (!validation.valid) throw new Error(validation.reason);

    const prospectiveSubmissions = new Map(group.submissions);
    prospectiveSubmissions.set(submission.actorId, submission);
    if (prospectiveSubmissions.size < group.requests.length) {
      group.submissions.set(submission.actorId, submission);
      return {
        status: 'waiting',
        received: prospectiveSubmissions.size,
        required: group.requests.length,
      };
    }

    const resolutions = group.requests.map((pendingRequest) => {
      const response = prospectiveSubmissions.get(pendingRequest.actorId);
      if (response === undefined) throw new Error('Decision barrier is missing an actor response');
      return { request: pendingRequest, submission: response };
    }) as DecisionResolution<M, DecisionKind<M>>[];
    const nextState = strategy.apply(this.state, resolutions);

    this.state = nextState;
    this.version += 1;
    this.activeGroup = null;
    this.pendingRequests = [];
    this.advance();
    return { status: 'resolved', stateVersion: this.version };
  }

  private advance(): void {
    const next = this.options.game.turnPolicy.next(this.state);
    if (next === null) {
      this.activeGroup = null;
      this.pendingRequests = [];
      return;
    }
    if (next.actorIds.length === 0) throw new Error('An active decision must have at least one actor');

    const seenActors = new Set<string>();
    const requests = next.actorIds.map((actorId) => {
      if (!this.playersById.has(actorId)) throw new Error(`Decision actor is not a player: ${actorId}`);
      if (seenActors.has(actorId)) throw new Error(`Decision actor appears more than once: ${actorId}`);
      seenActors.add(actorId);

      const strategy = this.options.game.strategies[next.kind];
      const context = strategy.createContext(this.state, actorId);
      const id = this.options.createDecisionId?.(this.options.tableId, ++this.sequence)
        ?? `${this.options.tableId}/decision/${++this.sequence}`;
      if (this.issuedDecisionIds.has(id)) throw new Error(`Decision ID was already issued: ${id}`);
      this.issuedDecisionIds.add(id);

      return this.options.decisions.parseRequest({
        id,
        tableId: this.options.tableId,
        kind: next.kind,
        actorId,
        stateVersion: this.version,
        context,
      });
    });

    this.pendingRequests = requests;
    this.activeGroup = {
      kind: next.kind,
      requests,
      submissions: new Map(),
    };
  }
}
