import type { DecisionMap, PlayerSnapshot } from '@board-games/protocol';

/** Identifies the already-projected player view requested by a UI boundary. */
export interface TableViewQuery {
  tableId: string;
  viewerId: string;
}

/** Retrieves a validated, viewer-specific snapshot. Rendering code consumes snapshots after this port. */
export interface TableViewLoader<M extends DecisionMap, V> {
  load(query: TableViewQuery): Promise<PlayerSnapshot<M, V>>;
}
