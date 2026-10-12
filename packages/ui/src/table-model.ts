import type { DecisionMap, PlayerSnapshot } from '@board-games/protocol';

export interface TablePosition {
  boardId: string;
  x: number;
  y: number;
  layer?: number;
}

export interface BoardModel {
  id: string;
  label: string;
  columns: number;
  rows: number;
}

export interface CardModel {
  id: string;
  face: 'front' | 'back';
  title?: string;
  art?: string;
  selected?: boolean;
  position?: TablePosition;
}

export interface TokenModel {
  id: string;
  label?: string;
  color?: string;
  selected?: boolean;
  position?: TablePosition;
}

/** A renderer-neutral game visual extension; `type` is interpreted by the game table, not this package. */
export interface CustomVisualModel<Payload = unknown> {
  id: string;
  type: string;
  payload: Payload;
}

export interface TablePresentationContent<Extension = unknown> {
  title: string;
  boards: readonly BoardModel[];
  cards: readonly CardModel[];
  tokens: readonly TokenModel[];
  customVisuals: readonly CustomVisualModel<Extension>[];
}

/** Render-ready model assembled from a snapshot already retrieved for this viewer. */
export interface TablePresentationModel<M extends DecisionMap, Extension = unknown>
  extends TablePresentationContent<Extension> {
  tableId: string;
  viewerId: string;
  stateVersion: number;
  pendingDecisions: PlayerSnapshot<M, unknown>['pending'];
}

/** Purely composes game visuals from available player data and carries its safe pending requests forward. */
export function composeTablePresentation<M extends DecisionMap, View, Extension = unknown>(
  snapshot: PlayerSnapshot<M, View>,
  compose: (snapshot: PlayerSnapshot<M, View>) => TablePresentationContent<Extension>,
): TablePresentationModel<M, Extension> {
  const content = compose(snapshot);
  return {
    tableId: snapshot.tableId,
    viewerId: snapshot.viewerId,
    stateVersion: snapshot.stateVersion,
    ...content,
    pendingDecisions: snapshot.pending,
  };
}
