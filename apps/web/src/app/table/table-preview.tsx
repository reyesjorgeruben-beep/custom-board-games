'use client';

import React from 'react';
import { useState } from 'react';
import type { DecisionSubmission } from '@board-games/protocol';
import { useTableSelection } from '@board-games/ui/interactions';
import { ActionButton, ActionPanel, Board, BoardPiece, Card, Token } from '@board-games/ui/primitives';
import { TableViewport } from '@board-games/ui/viewport';
import { createPreviewSubmission, tablePreviewModel, type PreviewDecisions } from './table-fixture.ts';

export function TablePreview() {
  const { selectedId, toggle, isSelected } = useTableSelection();
  const [capturedSubmission, setCapturedSubmission] = useState<DecisionSubmission<PreviewDecisions> | null>(null);
  const board = tablePreviewModel.boards[0]!;
  const request = tablePreviewModel.pendingDecisions.find((decision) => decision.kind === 'chooseRoute');

  function onSubmit(submission: DecisionSubmission<PreviewDecisions>) {
    setCapturedSubmission(submission);
  }

  return (
    <div className="table-preview" data-selected-piece={selectedId ?? ''}>
      <section className="table-preview__seat" aria-labelledby="table-seat-title">
        <p className="table-preview__kicker">Your view</p>
        <h2 id="table-seat-title">Seat one</h2>
        <div className="table-preview__seat-token">
          <Token token={{ id: 'seat-one', label: 'You', color: '#af8242', selected: isSelected('token:you') }} onSelect={() => toggle('token:you')} />
        </div>
        <p className="table-preview__seat-copy">This player view includes only the sample information addressed to you.</p>
        <dl className="table-preview__snapshot-meta">
          <div><dt>Table</dt><dd>{tablePreviewModel.title}</dd></div>
          <div><dt>Version</dt><dd>{tablePreviewModel.stateVersion}</dd></div>
        </dl>
      </section>

      <div className="table-preview__board">
        <TableViewport label="Crossroads sample board">
          <Board model={board}>
            {tablePreviewModel.cards.filter((card) => card.position?.boardId === board.id).map((card) => card.position && (
              <BoardPiece key={card.id} board={board} position={card.position}>
                <Card card={{ ...card, selected: isSelected(`card:${card.id}`) }} onSelect={(id) => toggle(`card:${id}`)} />
              </BoardPiece>
            ))}
            {tablePreviewModel.tokens.filter((token) => token.position?.boardId === board.id).map((token) => token.position && (
              <BoardPiece key={token.id} board={board} position={token.position}>
                <Token token={{ ...token, selected: isSelected(`token:${token.id}`) }} onSelect={(id) => toggle(`token:${id}`)} />
              </BoardPiece>
            ))}
          </Board>
        </TableViewport>
      </div>

      <aside className="table-preview__decision-rail" aria-label="Pending decision preview">
        {request?.kind === 'chooseRoute' ? (
          <ActionPanel
            id="sample-route-choice"
            title={request.context.prompt}
            description="Try an action control to see the typed response captured. The sample state will not change."
          >
            {request.context.options.map((option) => (
              <ActionButton key={option.id} onClick={() => onSubmit(createPreviewSubmission(request, option.id))}>
                {option.label}
              </ActionButton>
            ))}
          </ActionPanel>
        ) : (
          <section className="table-action-panel" aria-label="No pending sample decision">
            <h2>No pending sample decision</h2>
          </section>
        )}
        <p className="table-preview__capture" aria-live="polite">
          {capturedSubmission
            ? `Captured the ${capturedSubmission.response.route} response for version ${capturedSubmission.stateVersion}. The fixture snapshot is unchanged.`
            : 'Responses are captured locally for this preview.'}
        </p>
      </aside>
    </div>
  );
}
