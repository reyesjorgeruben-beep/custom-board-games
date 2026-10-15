import type { DecisionRequestFor, DecisionSubmission, PlayerSnapshot } from '@board-games/protocol';
import { composeTablePresentation, type BoardModel, type CardModel, type TablePresentationModel, type TokenModel } from '@board-games/ui';

export type PreviewDirection = 'west' | 'east';

export type PreviewDecisions = {
  chooseRoute: {
    context: {
      prompt: string;
      options: readonly { id: PreviewDirection; label: string }[];
    };
    response: { route: PreviewDirection };
  };
};

interface PreviewView {
  title: string;
  board: BoardModel;
  cards: readonly CardModel[];
  tokens: readonly TokenModel[];
}

const previewBoard: BoardModel = {
  id: 'crossroads',
  label: 'Crossroads',
  columns: 8,
  rows: 6,
};

const previewSnapshot: PlayerSnapshot<PreviewDecisions, PreviewView> = {
  tableId: 'sample-crossroads',
  viewerId: 'sample-player',
  stateVersion: 3,
  view: {
    title: 'Crossroads',
    board: previewBoard,
    cards: [
      { id: 'wayfinder', face: 'front', title: 'Wayfinder', position: { boardId: previewBoard.id, x: 1, y: 1, layer: 2 } },
      { id: 'unrevealed', face: 'back', position: { boardId: previewBoard.id, x: 6, y: 3, layer: 2 } },
    ],
    tokens: [
      { id: 'you', label: 'You', color: '#af8242', position: { boardId: previewBoard.id, x: 3, y: 2, layer: 3 } },
      { id: 'visitor', label: 'Visitor', color: '#765a69', position: { boardId: previewBoard.id, x: 4, y: 3, layer: 3 } },
    ],
  },
  pending: [{
    id: 'sample-route-choice',
    tableId: 'sample-crossroads',
    kind: 'chooseRoute',
    actorId: 'sample-player',
    stateVersion: 3,
    context: {
      prompt: 'Choose a direction',
      options: [
        { id: 'west', label: 'West path' },
        { id: 'east', label: 'East path' },
      ],
    },
  }],
};

export const tablePreviewModel: TablePresentationModel<PreviewDecisions> = composeTablePresentation<PreviewDecisions, PreviewView>(
  previewSnapshot,
  ({ view }) => ({
    title: view.title,
    boards: [view.board],
    cards: view.cards,
    tokens: view.tokens,
    customVisuals: [],
  }),
);

export function createPreviewSubmission(
  request: DecisionRequestFor<PreviewDecisions, 'chooseRoute'>,
  route: PreviewDirection,
): DecisionSubmission<PreviewDecisions> {
  return {
    decisionId: request.id,
    kind: request.kind,
    actorId: request.actorId,
    stateVersion: request.stateVersion,
    response: { route },
  };
}
